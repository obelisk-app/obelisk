/**
 * REQs pinned to relays a caller named (a mesh call's roster and signals,
 * presence on the call's relay, a replace-mode SFU or read-state read).
 * They are not the session's tracked REQs: a relay switch leaves them
 * alone, because the call goes on wherever the user browses. A session
 * reset and `dispose` release them. Pure move from `client.ts`.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { RelayHub } from '@/lib/relay-hub';
import type { TrackedSub, WatchedSubOptions } from '../facade/context';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { RELAY_SWITCH_GRACE_MS } from '@/constants/nostr-bridge/subscriptions';

/** Options of a mesh call's REQ (`subscribeVoiceFilterWatched`). */
export interface VoiceReqOptions {
  watchdogMs?: number;
  maxAttempts?: number;
  relays?: readonly string[];
  relayMode?: 'merge' | 'replace';
  affectsRelayAccess?: boolean;
  /** See subscribeWatched: without it a quota/rate-limit CLOSE is final. */
  onQuotaOrRateLimitClose?: () => void;
  onEose?: () => void;
  /**
   * Answer NIP-42 AUTH on these relays while the sub is open, even when
   * they aren't the relay being browsed. Only for the mesh call's own
   * roster/signal feed: the user joined a call there, and every beacon
   * it publishes already carries their pubkey. Other override-relay
   * readers stay anonymous.
   */
  answerAuth?: boolean;
}

export interface PinnedRequestsDeps {
  readonly hub: Pick<RelayHub, 'acquireAuthLease' | 'disconnect'>;
  relays(): string[];
  subscribeWatched(
    relays: string[],
    filter: Filter,
    onevent: (ev: NostrEvent) => void,
    oneose?: () => void,
    options?: WatchedSubOptions,
  ): TrackedSub;
}

export class PinnedRequests {
  private readonly pinnedSubs = new Map<TrackedSub, readonly string[]>();

  constructor(private readonly deps: PinnedRequestsDeps) {}

  /**
   * A mesh call's roster or signal REQ: a watched REQ at `'voice'` priority
   * on the hub's registry (round 2 design, step 5), so the budget parks a
   * background stream rather than the call when the relay's REQ cap is
   * near, and the reconnect re-issue puts the call first. It rides the
   * session's one socket to the relay: joining a call on the relay being
   * browsed costs no second socket and no second NIP-42 prompt. With
   * `answerAuth` the call holds a `'voice'` lease on each relay for as long
   * as the REQ is open, which is what lets a pinned relay the user is not
   * browsing answer its challenge. The REQ survives a relay switch (see
   * `pinnedSubs`).
   */
  subscribeVoice(
    filter: Filter,
    onEvent: (ev: NostrEvent) => void,
    options?: VoiceReqOptions,
  ): () => void {
    const targetRelays = this.targets(options);
    // Lease before the REQ: the registry opens the socket for it and the hub
    // installs the signer on creation, so the relay's first challenge is
    // answered. Refcounted, so the relay is AUTH-able exactly while a call
    // needs it.
    const voiceLeases = options?.answerAuth ? targetRelays.map((r) => this.deps.hub.acquireAuthLease(r, 'voice')) : [];
    const stop = this.subscribe(targetRelays, filter, onEvent, { ...options, priority: 'voice' });
    return () => {
      stop();
      for (const lease of voiceLeases) lease.release();
    };
  }

  /** The relays a caller-pinned REQ goes to: the named ones, merged with the active relay unless `replace`. */
  targets(options?: { relays?: readonly string[]; relayMode?: 'merge' | 'replace' }): string[] {
    return options?.relays && options.relays.length > 0
      ? Array.from(new Set(options.relayMode === 'replace'
          ? [...options.relays]
          : [...this.deps.relays(), ...options.relays]))
      : this.deps.relays();
  }

  /**
   * A watched REQ on relays the caller named, kept out of `subs` so a
   * relay switch does not close it. Access reporting is off unless asked
   * for: these relays are usually not the one whose banner is shown.
   */
  subscribe(
    relays: string[],
    filter: Filter,
    onEvent: (ev: NostrEvent) => void,
    options?: WatchedSubOptions & { onEose?: () => void },
  ): () => void {
    const sub = this.deps.subscribeWatched(
      relays,
      filter,
      onEvent,
      options?.onEose,
      { ...options, affectsRelayAccess: options?.affectsRelayAccess ?? false },
    );
    this.pinnedSubs.set(sub, relays);
    return () => this.release(sub);
  }

  /**
   * Release a pinned REQ. A relay it held open that nobody else uses (not
   * browsed, no other pinned REQ) is let go on the switch grace: the socket
   * table keeps an idle socket until budget pressure, and a call's relay
   * should not stay open after the call. The hub ignores the call for a
   * socket that still has REQs or an explicit hold.
   */
  release(sub: TrackedSub): void {
    const relays = this.pinnedSubs.get(sub);
    if (!relays) return;
    this.pinnedSubs.delete(sub);
    sub.close();
    const stillPinned = new Set(Array.from(this.pinnedSubs.values()).flat().map(normalizeRelayUrl));
    const active = new Set(this.deps.relays().map(normalizeRelayUrl));
    for (const url of relays) {
      const key = normalizeRelayUrl(url);
      if (active.has(key) || stillPinned.has(key)) continue;
      this.deps.hub.disconnect(url, { graceMs: RELAY_SWITCH_GRACE_MS });
    }
  }

  /**
   * Release every pinned REQ (a session reset, a teardown). The sockets they
   * held open on relays the user is not browsing go on the same grace as a
   * relay being switched away from.
   */
  releaseAll(): void {
    for (const sub of Array.from(this.pinnedSubs.keys())) this.release(sub);
  }
}
