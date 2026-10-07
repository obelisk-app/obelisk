/**
 * Where DMs go and where they come from, per peer (round 4 plan, step 15,
 * `dm/relays.ts`): a recipient's NIP-65 read relays (kind 10002), a
 * partner's NIP-17 inbox (kind 10050), the strictly ordered gift-wrap
 * ladder that picks one of them, our own inbox and NIP-65 lists for the
 * incoming-DM subscription, and the kind-10050 we publish so others can
 * find us. Pure move from `client.ts`; the two per-peer caches are the
 * bounded `RelayListCache` (hub step 8). The privacy reasoning on each
 * method is the one that was in the facade; `docs/dm-metadata-privacy.md`
 * is the long form.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { parseInboxRelayList, parseRelayList } from '@nostr-wot/data';
import type { NostrSigner as DmNostrSigner } from '@nostr-wot/signers';
import { KIND_DM_INBOX_RELAYS, KIND_RELAY_LIST } from '@/constants/nostr/nip-kinds';
import type { BridgeContext } from '../facade/context';
import { newestEvent } from '../profile/profile-sync-cache';
import { PROFILE_RELAYS } from '@/constants/nostr-bridge/profile';
import type { PublishSignedOpts } from '../publish/publish';
import { isImportableRelayUrl, uniqueRelayUrls } from '../relay/relay-list';
import { RelayListCache } from './relay-cache';
import { ensureInboxPublished } from './inbox-list';

export type DmRelaysContext = Pick<BridgeContext, 'session' | 'relays' | 'queryRelaysWithConfidence'>;

export interface DmRelaysDeps {
  /** The session's signer for DM-side events (`session/signer`), or null when logged out. */
  dmSigner(): DmNostrSigner | null;
  publishSignedEvent(ev: NostrEvent, relays: string[], opts: PublishSignedOpts): Promise<NostrEvent>;
}

export class DmRelaysModule {
  /**
   * Our own NIP-17 inbox and NIP-65 relays beyond the active one, resolved
   * after the DM subscription opens so other clients' deliveries are heard.
   * Also where our self-copy of a gift wrap goes.
   */
  private myRelays: string[] = [];
  // Per-pubkey cache of recipient NIP-65 read relays (where they read DMs).
  // Populated on first sendDirectMessage to that pubkey; bounded and TTL'd
  // so a send never requeries and the map never grows past the last
  // thousand peers.
  private readonly recipientReadRelays = new RelayListCache();
  // Per-pubkey cache of a partner's published NIP-17 inbox relays (kind
  // 10050). Same shape and TTLs: without it every single NIP-17 send
  // re-runs a 4s discovery REQ for the same peer, which is both slow and
  // one more observable read per message.
  private readonly partnerInboxRelays = new RelayListCache();

  constructor(
    private readonly ctx: DmRelaysContext,
    private readonly deps: DmRelaysDeps,
  ) {}

  mine(): readonly string[] {
    return this.myRelays;
  }

  setMine(relays: string[]): void {
    this.myRelays = relays;
  }

  /** Logout: the next session resolves its own lists. The per-peer caches are public data and stay. */
  reset(): void {
    this.myRelays = [];
  }

  /**
   * Look up a recipient's NIP-65 (kind 10002) read relays so we can publish
   * DMs to relays they actually subscribe to. Cached per-pubkey for 6h.
   * Returns an empty list on miss/timeout, caller falls back to `this.ctx.relays()`.
   */
  async fetchRecipientReadRelays(pubkey: string): Promise<string[]> {
    const cached = this.recipientReadRelays.get(pubkey);
    if (cached) return Array.from(cached);
    const searchRelays = Array.from(new Set([...this.ctx.relays(), ...PROFILE_RELAYS]));
    const result = await this.ctx.queryRelaysWithConfidence(
      searchRelays,
      { kinds: [KIND_RELAY_LIST], authors: [pubkey], limit: 1 },
      4000,
    );
    const event = newestEvent(result.events);
    const read = event ? parseRelayList(event, 'public').read.filter(isImportableRelayUrl) : [];
    if (event || result.complete) this.recipientReadRelays.set(pubkey, read);
    return read;
  }

  /**
   * Look up `pubkey`'s NIP-17 inbox relays (kind 10050).
   *
   * Returns **only** what they published, or `[]` when they have published
   * nothing usable. It deliberately does not union in any relay of ours:
   * routing is decided one level up, in {@link resolveGiftWrapRelays}, and
   * conflating "where they listen" with "where we happen to be connected"
   * is precisely the metadata leak this function used to cause.
   *
   * Resolved via the bridge's own pool rather than `@nostr-wot/dm`'s
   * `fetchInboxRelays`, see the `KIND_DM_INBOX_RELAYS` comment above.
   *
   * This is a *read*, not an AUTH'd publish. The search net stays wide
   * (active relay + profile relays) because a REQ for a public, replaceable
   * relay-list event is orders of magnitude less revealing than publishing a
   * gift wrap over an authenticated socket: no wrap, no timing correlation,
   * and `automaticallyAuth` already refuses to answer NIP-42 challenges from
   * anything that isn't the active relay or one of our own DM relays. Failing
   * to find an inbox list is what causes the fallbacks below, so narrowing
   * the *read* would buy almost no privacy and cost real deliverability.
   */
  async fetchPartnerInboxRelays(pubkey: string): Promise<string[]> {
    const cached = this.partnerInboxRelays.get(pubkey);
    if (cached) return Array.from(cached);
    try {
      const searchRelays = Array.from(new Set([...this.ctx.relays(), ...this.myRelays, ...PROFILE_RELAYS]));
      const { events, complete } = await this.ctx.queryRelaysWithConfidence(
        searchRelays,
        { kinds: [KIND_DM_INBOX_RELAYS], authors: [pubkey], limit: 1 },
        4000,
      );
      const newest = newestEvent(events);
      const relays = newest ? parseInboxRelayList(newest, 'public').filter(isImportableRelayUrl) : [];
      // Only cache an authoritative answer. A timeout with no event is "we
      // don't know yet", not "they have no inbox", caching that would pin a
      // peer onto the fallback path for six hours.
      if (newest || complete) this.partnerInboxRelays.set(pubkey, relays);
      return relays;
    } catch {
      return [];
    }
  }

  /**
   * Decide where a NIP-17 gift wrap addressed to `pubkey` is published.
   *
   * **This is a privacy boundary, not a delivery convenience.** A kind-1059
   * is signed by a throwaway key so a relay learns only "some ephemeral key
   * dropped a wrap for someone". That guarantee evaporates the moment the
   * wrap also lands on the relay the user is browsing: that socket is
   * NIP-42-authenticated as the real sender (see `automaticallyAuth`), so
   * the relay gets the sender's true identity, the true send time, and, if
   * the recipient happens to read there too, the sender-to-recipient edge
   * for free. Unioning the partner's inbox with our own active relay handed
   * that away on *every* DM, including ones where the partner had published
   * a perfectly good inbox list.
   *
   * So the ladder is strictly ordered, and each rung is used *alone*:
   *
   * 1. **Their kind-10050 inbox.** The answer NIP-17 defines. Nothing of
   *    ours is added, if they say "deliver here", here is where it goes.
   * 2. **Their NIP-65 read relays.** Still relays *they* chose, so the wrap
   *    stays on infrastructure the recipient controls. Reachability is worse
   *    than a real inbox list but the leak profile is the same.
   * 3. **Our active relay.** Last resort, and the one rung that carries a
   *    real cost: this relay sees an AUTH'd publish from us. We take it
   *    anyway because the spec is explicit that a missing inbox list must
   *    never block a send, and a message that reaches nobody is not a
   *    privacy win. It fires only for peers who have published neither a
   *    10050 nor a 10002, for whom NIP-17 delivery is a guess regardless.
   *
   * The `source` is returned so callers can log/diagnose which rung ran
   * without re-deriving it.
   */
  async resolveGiftWrapRelays(
    pubkey: string,
  ): Promise<{ relays: string[]; source: 'inbox' | 'nip65' | 'active-relay' }> {
    const inbox = await this.fetchPartnerInboxRelays(pubkey).catch(() => [] as string[]);
    if (inbox.length > 0) return { relays: uniqueRelayUrls(inbox), source: 'inbox' };
    const read = await this.fetchRecipientReadRelays(pubkey).catch(() => [] as string[]);
    if (read.length > 0) return { relays: uniqueRelayUrls(read), source: 'nip65' };
    return { relays: uniqueRelayUrls(this.ctx.relays()), source: 'active-relay' };
  }

  /**
   * Fetch the user's own kind 10050 (NIP-17 inbox) + kind 10002 (NIP-65)
   * relay lists across a wide search net. Used after connect to extend the
   * incoming-DM subscription onto the relays where other clients (Damus,
   * Amethyst, Primal, …) actually deliver DMs addressed to us.
   */
  // NIP-17 inbox relay list (kind 10050). `@nostr-wot/dm/cache` also exports
  // `KIND_DM_INBOX_RELAYS` plus `fetchInboxRelays`/`publishInboxRelays`,
  // but that submodule pulls in `@nostr-wot/data`'s separate pool/coalescer
  // (used by the WoT/profile hooks elsewhere in the app). The bridge already
  // has its own well-exercised relay-list fetch/publish path
  // (`queryRelaysWithConfidence` + `signAndPublish`/`publishSignedEvent`, the
  // same one `fetchRecipientReadRelays` uses), so DM inbox-list I/O stays on
  // that instead of standing up a second pool for it.
  async fetchMine(): Promise<string[]> {
    const session = this.ctx.session();
    if (!session) return [];
    const me = session.pubKeyHex;
    const searchRelays = Array.from(new Set([...this.ctx.relays(), ...PROFILE_RELAYS]));
    const out = new Set<string>();
    try {
      const { events } = await this.ctx.queryRelaysWithConfidence(
        searchRelays,
        { kinds: [KIND_RELAY_LIST, KIND_DM_INBOX_RELAYS], authors: [me] },
        4000,
      );
      // Pick the newest of each kind.
      const newest = new Map<number, NostrEvent>();
      for (const ev of events) {
        const cur = newest.get(ev.kind);
        if (!cur || ev.created_at > cur.created_at) newest.set(ev.kind, ev);
      }
      const meta = newest.get(10002);
      if (meta) {
        const { read, write } = parseRelayList(meta, 'public');
        read.forEach((u) => { if (isImportableRelayUrl(u)) out.add(u); });
        write.forEach((u) => { if (isImportableRelayUrl(u)) out.add(u); });
      }
      const inbox = newest.get(10050);
      if (inbox) parseInboxRelayList(inbox, 'public').forEach((u) => { if (isImportableRelayUrl(u)) out.add(u); });
    } catch {
      // best-effort, fall through to whatever we have
    }
    return Array.from(out);
  }

  /** Publish our kind-10050 inbox list when it is missing or stale (`./inbox-list.ts`). */
  ensureInboxPublished(): Promise<void> {
    return ensureInboxPublished(this.ctx, { ...this.deps, mine: () => this.myRelays });
  }
}
