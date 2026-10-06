/**
 * Publishing: `publishEvent` (public), `signAndPublish` (sign, then
 * publish), `publishSignedEvent` (the relay round with its AUTH modes and
 * retries) and `publishSignedEventToRelays` (the bare accepted-relays
 * variant). Every round goes through the hub's publish (`publish-round.ts`,
 * migration step 10): the hub owns the sockets, isolates each relay,
 * answers `auth-required:` with the lease-gated signer, and reports one row
 * per relay. The signing is `publish-sign.ts`, the explicit
 * AUTH-and-republish round `publish-auth.ts` (injected), and the reading of
 * each round's results `publish-results.ts`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { PublishAuthMode, RelayHub } from '@/lib/relay-hub';
import { KIND_CONTACT_LIST, KIND_EMOJI_FAVORITES, KIND_EMOJI_SET } from '@/utils/nip-kinds';
import { failActivity, pushActivity, resolveActivity } from '@/services/activity-log';
import { pushRelayDebug } from './relay-debug';
import { eventKindDescription } from './kind-description';
import { uniqueRelayUrls } from './relay-list';
import type { AuthSigner, BridgeContext, PublishRelayOpts } from './context';
import { publishRound } from './publish-round';
import { signForSession, type SignDeps, type SignableTemplate } from './publish-sign';
import {
  acceptedOf,
  alreadyJoined,
  anyAuthRequired,
  authShapedRefusals,
  isAuthRequired,
  rejectionMessage,
  reportRejections,
  reportRetryRejections,
  timedOutEverywhere,
  type PublishResults,
} from './publish-results';

export type PublishOpts = PublishRelayOpts;

export interface PublishSignedOpts {
  quiet?: boolean;
  authMode?: 'always' | 'last-resort' | 'never';
  authRetryOnRestricted?: boolean;
}

/**
 * Some relays never ACK an ephemeral kind, so the caller of an ephemeral
 * publish waits this long and no longer; the round itself carries on in
 * the background.
 */
export const EPHEMERAL_CALLER_WAIT_MS = 750;

/**
 * The hub's per-relay wait for an ephemeral round: a fresh socket gets this
 * long to come up and OK before the hub counts the event sent. Longer than
 * the caller's wait on purpose, so a beacon on a socket still handshaking
 * is sent rather than dropped.
 */
export const EPHEMERAL_ROUND_WAIT_MS = 4000;

export interface PublishDeps extends SignDeps {
  readonly hub: Pick<RelayHub, 'publish' | 'acquireAuthLease'>;
  getAuthSigner(): AuthSigner | undefined;
  /** AUTH one socket explicitly and republish; null when AUTH cannot help (`publish-auth.ts`). */
  authAndRepublish(url: string, event: NostrEvent): Promise<PromiseSettledResult<string> | null>;
  /** Own-list kinds (3, 30030, 10030) echo into their stores after an accepted publish. */
  onPublished(event: NostrEvent): void;
}

export class PublishModule {
  constructor(
    private readonly ctx: BridgeContext,
    private readonly deps: PublishDeps,
  ) {}

  async publishEvent(template: {
    kind: number;
    content: string;
    tags: string[][];
    created_at?: number;
  }, opts: PublishOpts = {}): Promise<NostrEvent> {
    const event = await this.signAndPublish(
      {
        kind: template.kind,
        content: template.content,
        tags: template.tags,
        created_at: template.created_at ?? Math.floor(Date.now() / 1000),
      },
      opts,
      opts.quiet ? { quiet: true } : undefined,
    );
    if (event.kind === KIND_CONTACT_LIST || event.kind === KIND_EMOJI_SET || event.kind === KIND_EMOJI_FAVORITES) {
      this.deps.onPublished(event);
    }
    return event;
  }

  async signAndPublish(
    template: SignableTemplate,
    relayOpts: PublishOpts | readonly string[] = {},
    opts?: { quiet?: boolean },
  ): Promise<NostrEvent> {
    // Two call shapes: legacy `string[]` (merge with the active relays) and
    // the `{ extraRelays, mode }` opts. Internal callers still pass arrays;
    // translate here so the publish path below has one shape.
    const normalized: PublishOpts = Array.isArray(relayOpts)
      ? { extraRelays: relayOpts }
      : (relayOpts as PublishOpts);
    const extraRelays = normalized.extraRelays ?? [];
    const session = this.ctx.session();
    if (!session) throw new Error('Not logged in');
    // `quiet`: best-effort background publish (e.g. lazy member self-add).
    // Suppress the activity-bar lifecycle so the user doesn't see a
    // Publishing/Failed toast for a write the relay routinely declines.
    const event = await signForSession(session, this.deps, template, {
      quiet: opts?.quiet,
      startDeadlineMs: normalized.signStartDeadlineMs,
    });
    const targetRelays = (normalized.mode ?? 'merge') === 'replace'
      ? Array.from(new Set(extraRelays))
      : Array.from(new Set([...this.ctx.relays(), ...extraRelays]));
    return this.publishSignedEvent(event, targetRelays, {
      ...opts,
      ...(normalized.authRetryOnRestricted ? { authRetryOnRestricted: true } : {}),
    });
  }

  /**
   * Publish an already-signed event with retry/rejection-state handling,
   * the tail half of `signAndPublish`, split out so callers that sign
   * outside the session-dispatch path (NIP-17 gift wraps, signed by a fresh
   * ephemeral key inside `sealAndGiftWrap`, not by the session's own key)
   * still get the same relay-access tracking and timeout retry.
   *
   * ### `authMode`, who the relay learns we are
   *
   * The hub answers a relay's `auth-required:` refusal only when told to
   * (`'policy'`) and only on a socket that holds an AUTH lease; the socket
   * of a relay nobody leased never gets a signer. So `authMode` is the
   * question "if this relay demands to know who we are, do we tell it?".
   *
   * - `'always'` (default), yes. Correct for events we sign with our own
   *   key: the event already carries our pubkey, so AUTH reveals nothing new.
   * - `'last-resort'`, not up front. Used for NIP-17 gift wraps, where the
   *   entire point is that the publishing identity is a throwaway key: an
   *   AUTH would staple our real pubkey to a wrap engineered not to carry it.
   *   If *no* relay accepted the event and at least one refusal was
   *   auth-shaped, we re-publish with AUTH rather than fail the send, the
   *   spec is explicit that nothing here may block a message. That costs the
   *   metadata only against relays that would have refused us anyway, and
   *   only after the anonymous attempt has been tried.
   * - `'never'`, no AUTH at any point. For public, self-describing events
   *   (the kind-10050 inbox list) that are broadcast for discoverability:
   *   a relay declining to store one is a non-event, and authenticating to
   *   relays the user never chose is not a price worth paying for it.
   */
  async publishSignedEvent(
    event: NostrEvent,
    targetRelays: string[],
    opts?: PublishSignedOpts,
  ): Promise<NostrEvent> {
    const authMode = opts?.authMode ?? 'always';
    const roundAuth: PublishAuthMode = authMode === 'always' && this.deps.getAuthSigner() ? 'policy' : 'never';
    const pubId = opts?.quiet ? null : pushActivity(
      'Publishing to relays',
      "kind " + event.kind + " -> " + targetRelays.length + " relay(s)",
      { operation: "publish", eventKind: event.kind, description: eventKindDescription(event.kind) },
    );
    pushRelayDebug({ kind: "publish-start", relays: targetRelays, eventKind: event.kind, status: eventKindDescription(event.kind) });

    const results = await this.firstRound(event, targetRelays, roundAuth);
    if (results === null) {
      if (pubId != null) resolveActivity(pubId, `ephemeral → ${targetRelays.length} relay(s)`);
      return event;
    }

    reportRejections(this.ctx, results, targetRelays, event.kind);
    let finalResults = results;
    // First publish after a relay switch can time out while NIP-42 AUTH is
    // still settling on the fresh socket. By the time the user sees the
    // timeout the socket is authed, so a single retry succeeds and the user
    // doesn't have to manually click Create again. `roundAuth`, not a fresh
    // read of the signer: a timeout is not a demand for identification, so
    // the retry must honour `authMode`.
    if (timedOutEverywhere(acceptedOf(results), results)) {
      pushRelayDebug({ kind: "publish-retry", relays: targetRelays, eventKind: event.kind, reason: "all relays timed out" });
      finalResults = await publishRound(this.deps.hub, targetRelays, event, roundAuth);
      reportRetryRejections(finalResults, targetRelays, (url, state) => this.ctx.setRelayAccess(url, state));
    }
    // `authRetryOnRestricted`, see PublishOpts. Per relay, not all-or-none:
    // the voice relay can refuse while another target accepted.
    if (opts?.authRetryOnRestricted && authMode === 'always' && this.deps.getAuthSigner()) {
      finalResults = await this.republishAuthenticated(event, targetRelays, finalResults);
    }
    // `authMode: 'last-resort'`, the anonymous attempt above found no home
    // and at least one relay said so in NIP-42 terms. Delivery beats
    // metadata-minimisation at this point (the spec forbids letting privacy
    // machinery drop a message), so identify ourselves and try once more.
    // Deliberately after the timeout retry, so a plain slow relay does not
    // burn the escalation.
    if (authMode === 'last-resort' && acceptedOf(finalResults).length === 0
      && anyAuthRequired(finalResults) && this.deps.getAuthSigner()) {
      pushRelayDebug({
        kind: 'publish-auth-escalation',
        relays: targetRelays,
        eventKind: event.kind,
        reason: 'anonymous publish refused with auth-required; retrying authenticated',
      });
      finalResults = await this.escalate(event, targetRelays, finalResults);
      reportRetryRejections(finalResults, targetRelays, (url, state) => this.ctx.setRelayAccessDeferred(url, state));
    }
    const accepted = acceptedOf(finalResults);
    const joined = alreadyJoined(event, finalResults);
    if (accepted.length === 0 && !joined) {
      const msg = rejectionMessage(event, finalResults, targetRelays);
      if (pubId != null) failActivity(pubId, msg);
      pushRelayDebug({ kind: "publish-error", relays: targetRelays, eventKind: event.kind, reason: msg });
      throw new Error(msg);
    }
    if (pubId != null) resolveActivity(
      pubId,
      joined ? 'already joined' : "accepted by " + accepted.length + "/" + targetRelays.length,
    );
    pushRelayDebug({ kind: "publish-ok", relays: targetRelays, eventKind: event.kind, payload: { accepted: accepted.length, total: targetRelays.length, alreadyJoined: joined } });
    return event;
  }

  /** Publish to `relays` with the session's AUTH signer; the relays that accepted. */
  async publishSignedEventToRelays(ev: NostrEvent, relays: readonly string[]): Promise<string[]> {
    const targets = uniqueRelayUrls(Array.from(relays));
    const results = await publishRound(this.deps.hub, targets, ev, this.deps.getAuthSigner() ? 'policy' : 'never');
    return targets.filter((_, i) => results[i]?.status === 'fulfilled');
  }

  /**
   * The first round. An ephemeral kind does not hold its caller past
   * {@link EPHEMERAL_CALLER_WAIT_MS}: some relays never ACK one, so after
   * that the round finishes in the background and this returns null (sent,
   * fire-and-forget). Explicit rejections usually arrive at once, though,
   * and must flow through the normal error path; otherwise voice claims it
   * joined while every beacon and signal was denied.
   */
  private async firstRound(event: NostrEvent, targets: readonly string[], auth: PublishAuthMode): Promise<PublishResults | null> {
    const ephemeral = event.kind >= 20000 && event.kind < 30000;
    if (!ephemeral) return publishRound(this.deps.hub, targets, event, auth);
    const round = publishRound(this.deps.hub, targets, event, auth, EPHEMERAL_ROUND_WAIT_MS);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = await Promise.race([
      round,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), EPHEMERAL_CALLER_WAIT_MS); }),
    ]);
    if (timer) clearTimeout(timer);
    if (settled === null) {
      round.catch((e: unknown) => console.debug('[bridge] ephemeral publish skip', event.kind, e instanceof Error ? e.message : e));
    }
    return settled;
  }

  /**
   * The `'last-resort'` round: publish once more, answering `auth-required:`
   * this time. Each relay that refused in those words gets a `'publish'`
   * AUTH lease for the round, the caller's explicit permission to identify
   * to it: without one its socket has no signer and the hub could not
   * answer (the old pass-through pool asked a signer that refused and left
   * the AUTH hanging). The leases go as soon as the round settles.
   */
  private async escalate(event: NostrEvent, targets: readonly string[], results: PublishResults): Promise<PublishResults> {
    const leases = targets
      .filter((_, i) => isAuthRequired(results[i]))
      .map((url) => this.deps.hub.acquireAuthLease(url, 'publish'));
    try {
      return await publishRound(this.deps.hub, targets, event, 'policy');
    } finally {
      for (const lease of leases) lease.release();
    }
  }

  /** AUTH and republish once on each relay that refused in NIP-42 or whitelist terms. */
  private async republishAuthenticated(event: NostrEvent, targets: readonly string[], results: PublishResults): Promise<PublishResults> {
    const refused = authShapedRefusals(results);
    if (refused.length === 0) return results;
    const retried = await Promise.all(refused.map((i) => this.deps.authAndRepublish(targets[i], event)));
    const next = [...results];
    refused.forEach((i, k) => {
      const r = retried[k];
      if (r) next[i] = r;
    });
    return next;
  }
}
