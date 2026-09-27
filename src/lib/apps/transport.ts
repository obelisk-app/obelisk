/**
 * Nostr transport for app sessions (formerly games) — the direct analogue of
 * `src/lib/voice/transport.ts`, and deliberately shaped like it: publish
 * through the bridge signer, subscribe with the WATCHED variant so a relay
 * blip doesn't silently kill the sub, and gate everything in the handler
 * rather than trusting the relay's tag indexing.
 *
 * Sessions follow the single-relay rule (CLAUDE.md): a session lives on the
 * channel's relay, because the channel does. Nothing here ever fans out
 * across the user's configured relays.
 */
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge/client';
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_APP_SESSION } from '@/lib/nip-kinds';
import { ingestSessionEvents } from './ingest';
import type { AppManifest } from './manifest';
import {
  APP_TAG,
  LEGACY_GAME_TAG,
  SESSION_LOG_WINDOW_S,
  buildSessionCreate,
  opOf,
} from './session';

const SESSION_SUB_WATCHDOG_MS = 4000;

async function bridge() {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('nostr bridge not initialized');
  return impl;
}

/**
 * Publish, and try once more if the confirmation never came back.
 *
 * The relay closes connections on a five minute timer (`max_connection_duration`
 * and `idle_timeout` in its config, and its logs are full of `Broken pipe`
 * writing to sockets that already went away). A client holding a long-lived
 * socket does not necessarily notice: the EVENT goes into a half-open
 * connection, no OK comes back, and nostr-tools times the publish out. Open
 * the app, sit in a channel for a few minutes, then open an app — that is the
 * shape of it.
 *
 * The first failure is what makes the dead socket observable, so a second
 * attempt lands on a fresh one. Anything that is not a timeout — a real
 * refusal, with a reason — is passed straight through, because retrying a
 * rejection just annoys the relay twice.
 *
 * Whatever comes back is also fed straight into our own store. See {@link echo}.
 */
async function publishResilient(
  template: { kind: number; content: string; tags: string[][] },
): Promise<NostrEvent> {
  const b = await bridge();
  try {
    return echo(await b.publishEvent(template));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!looksLikeLostConfirmation(message)) throw err;

    // Retrying on the same pooled connection is pointless: SimplePool hands
    // back the same relay object, and if that socket is half-open the second
    // attempt dies exactly like the first. Drop it, so `publishEvent` opens a
    // fresh one, then ask again.
    b.dropRelayConnection();
    await new Promise((resolve) => setTimeout(resolve, 300));
    return echo(await b.publishEvent(template));
  }
}

/**
 * Ingest an event we just published, without waiting for the relay to echo it.
 *
 * A publisher used to sit and look at its own skeleton: create a table, and the
 * card stayed a spinner until the relay sent the kind 2390 back to us. There is
 * nothing to wait for — this is the same signed event, with the same id, that
 * every other client will replay, so putting it in the log now is not an
 * optimistic guess. The relay's copy arrives later and the dedupe eats it.
 *
 * Tolerant of anything unparseable on purpose: a signer or a test stub that
 * hands back a partial event must not break the publish it just completed.
 */
function echo(ev: NostrEvent): NostrEvent {
  if (ev && typeof ev.id === 'string' && opOf(ev)) ingestSessionEvents([ev]);
  return ev;
}

/** Sign and publish one session event (the app host's `publish`), resilient to a lost OK. */
export async function publishSessionEvent(
  template: { kind: number; content: string; tags: string[][] },
): Promise<NostrEvent> {
  return publishResilient(template);
}

/**
 * Create a table. Resolves with the table id (the create event's id).
 *
 * A publish that times out has NOT necessarily failed. The relay's OK travels
 * back over the same socket the EVENT went out on, and that socket can be gone
 * by the time it would arrive — the public relay closes connections on a five
 * minute timer, and its logs are full of `Broken pipe` while writing to sockets
 * that already went away. The event is stored; only the confirmation is lost.
 *
 * Telling the user "the relay rejected this" in that situation is wrong twice
 * over: the table exists, and they are told it doesn't. So a timeout sends us
 * looking for the event we just published — matched by a nonce we put in it —
 * before we give up on it.
 */
export async function publishSessionCreate(
  channelId: string,
  manifest: Pick<AppManifest, 'address' | 'aggregate' | 'paths' | 'api' | 'title'>,
): Promise<string> {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const b = await bridge();
  const template = buildSessionCreate(channelId, manifest, nonce, b.currentRelayUrl.get());

  try {
    const ev = await publishResilient(template);
    return ev.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!looksLikeLostConfirmation(message)) throw err;

    const recovered = await findCreateByNonce(channelId, nonce);
    if (recovered) return recovered;
    throw new Error(
      'The relay never confirmed the session. It may still appear in a moment — '
      + `check the channel before opening another. (${message})`,
    );
  }
}

/** A lost OK looks like a timeout, not like a refusal with a reason. */
export function looksLikeLostConfirmation(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('timed out') || m.includes('timeout') || m.includes('no relay accepted');
}

/**
 * Look for a create event we published but never got confirmation for.
 * Matched on the nonce, so it cannot pick up somebody else's table or an
 * earlier one of ours.
 */
export async function findCreateByNonce(
  channelId: string,
  nonce: string,
  waitMs = 4000,
): Promise<string | null> {
  const b = await bridge();
  const me = b.getPublicKey();
  if (!me) return null;

  return new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (id: string | null) => {
      if (done) return;
      done = true;
      unsub();
      clearTimeout(timer);
      resolve(id);
    };

    const unsub = b.subscribeFilterWatched(
      { kinds: [KIND_APP_SESSION], authors: [me], since: Math.floor(Date.now() / 1000) - 120 },
      (ev) => {
        if (opOf(ev) !== 'create') return;
        if (ev.tags.find((t) => t[0] === 'h')?.[1] !== channelId) return;
        let body: { nonce?: unknown } = {};
        try { body = JSON.parse(ev.content) as { nonce?: unknown }; } catch { return; }
        if (body.nonce !== nonce) return;
        // The publish whose OK went missing did land. Put it in the log before
        // handing the id back, so the card the caller is about to post a marker
        // for has something to render.
        ingestSessionEvents([ev]);
        finish(ev.id);
      },
      { watchdogMs: SESSION_SUB_WATCHDOG_MS },
    );

    const timer = setTimeout(() => finish(null), waitMs);
  });
}

/**
 * Tables fetched per channel. The relay returns the NEWEST n, so on a busy
 * Stacker channel a `create` can fall off the end of this — which is only
 * acceptable because a card resolves itself by id (`./resolve.ts`). This REQ is
 * for what is live in the channel, not for making a specific card render. Don't
 * lower it without checking that dependency still holds.
 */
export const CHANNEL_SESSION_LIMIT = 400;

/**
 * How long the tagged REQ is given to produce something before we go looking
 * for a reason it hasn't.
 */
export const TAG_PROBE_MS = 2500;

/**
 * Per relay: does it index single-letter tags for kind 2390? `true` once we
 * have proof, `false` once we have proof it doesn't. Absent means unknown.
 * Session-scoped — a relay's indexing does not change under us.
 */
const tagIndexOk = new Map<string, boolean>();

/** Test seam. */
export function __resetTagIndexProbe(): void {
  tagIndexOk.clear();
}

/**
 * Subscribe to every app session event in a channel.
 *
 * This used to filter on kind + `since` alone and gate the `h` tag in the
 * handler, for a real reason: a relay that doesn't index `#h` for an unfamiliar
 * kind answers a tag-filtered REQ with silence, and that silence is
 * indistinguishable from "nobody is playing here". The cost was that opening
 * any channel downloaded every game event on the relay for 24 hours — mostly
 * Stacker checkpoints, which carry board and input blobs — and `JSON.parse`d
 * each one before finding out it belonged to somebody else.
 *
 * So: ask the narrow question, and when it comes back empty, ask a *different*
 * question to find out why.
 *
 *   1. `{ kinds, '#h': [channel], since, limit }` — the live sub.
 *   2. If it produces nothing within `TAG_PROBE_MS`, one-shot
 *      `{ kinds, '#t': [APP_TAG, LEGACY_GAME_TAG], limit: 1 }`. Same kind, same class of
 *      single-letter indexed tag, no channel in it — so it answers exactly the
 *      question at issue. Every session event carries `['t', APP_TAG]` (`obelisk-game` before the migration).
 *      - It returns something → the relay does index these tags → the silent
 *        `#h` REQ meant what it said, and the broad filter is never opened.
 *      - It returns nothing → genuinely ambiguous → fall back to the old
 *        relay-wide filter, and remember that about this relay so the next
 *        channel skips the wait.
 *
 * Deciding on silence alone would have re-opened the firehose on every quiet
 * channel, which is most of them — keeping most of the bug while looking like a
 * fix.
 */
export async function subscribeChannelSessions(
  channelId: string,
  onEvent: (ev: NostrEvent) => void,
): Promise<() => void> {
  const b = await bridge();
  const relay = b.currentRelayUrl.get();
  const since = Math.floor(Date.now() / 1000) - SESSION_LOG_WINDOW_S;
  const seen = new Set<string>();

  let closed = false;
  let delivered = false;
  let broadSub: (() => void) | null = null;
  let probeSub: (() => void) | null = null;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;

  const handle = (ev: NostrEvent, fromTagged: boolean) => {
    if (fromTagged && !delivered) {
      // Proof the relay indexes the tag. Nothing more to find out, and nothing
      // more to listen to on the wide filter.
      delivered = true;
      tagIndexOk.set(relay, true);
      if (probeTimer !== null) { clearTimeout(probeTimer); probeTimer = null; }
      probeSub?.(); probeSub = null;
      broadSub?.(); broadSub = null;
    }
    if (seen.has(ev.id)) return;
    // Gate on the raw tag: the relay-wide fallback delivers every channel's.
    if (ev.tags.find((t) => t[0] === 'h')?.[1] !== channelId) return;
    if (!opOf(ev)) return;
    seen.add(ev.id);
    onEvent(ev);
  };

  const openBroad = () => {
    if (closed || delivered || broadSub) return;
    broadSub = b.subscribeFilterWatched(
      { kinds: [KIND_APP_SESSION], since },
      (ev) => handle(ev, false),
      { watchdogMs: SESSION_SUB_WATCHDOG_MS },
    );
  };

  const taggedSub = b.subscribeFilterWatched(
    { kinds: [KIND_APP_SESSION], '#h': [channelId], since, limit: CHANNEL_SESSION_LIMIT },
    (ev) => handle(ev, true),
    { watchdogMs: SESSION_SUB_WATCHDOG_MS },
  );

  if (tagIndexOk.get(relay) === false) {
    // Already established that this relay needs it. No point re-probing.
    openBroad();
  } else if (tagIndexOk.get(relay) !== true) {
    probeTimer = setTimeout(() => {
      probeTimer = null;
      if (closed || delivered) return;
      probeSub = b.subscribeFilterWatched(
        { kinds: [KIND_APP_SESSION], '#t': [APP_TAG, LEGACY_GAME_TAG], limit: 1 },
        () => {
          // The relay can index it after all, so the quiet `#h` sub is telling
          // the truth: nobody is playing in this channel.
          tagIndexOk.set(relay, true);
          probeSub?.(); probeSub = null;
          if (probeTimer !== null) { clearTimeout(probeTimer); probeTimer = null; }
        },
        { watchdogMs: SESSION_SUB_WATCHDOG_MS },
      );
      probeTimer = setTimeout(() => {
        probeTimer = null;
        if (closed || delivered || tagIndexOk.get(relay) === true) return;
        tagIndexOk.set(relay, false);
        probeSub?.(); probeSub = null;
        openBroad();
      }, TAG_PROBE_MS);
    }, TAG_PROBE_MS);
  }

  return () => {
    closed = true;
    if (probeTimer !== null) { clearTimeout(probeTimer); probeTimer = null; }
    probeSub?.(); probeSub = null;
    broadSub?.(); broadSub = null;
    taggedSub();
  };
}
