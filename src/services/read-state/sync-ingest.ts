/**
 * The read half of the read-state sync: paint the cached snapshot, then
 * subscribe on each relay and merge newer state into the store through the
 * scope's `apply`. See `relay-sync.ts` for the two scopes and transports.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { getBridgeImpl, hasSeenWrap, markWrapSeen, cacheGet, cacheSet } from '@/services/nostr-bridge';
import { unwrapForSelf } from '@/lib/nip-59';
import { KIND_GIFT_WRAP, KIND_NIP78_APP_DATA as KIND_INNER } from '@/utils/nip-kinds';
import {
  READ_STATE_WATCHDOG_MS,
  cacheKindFor,
  findInnerDTag,
  parsePayload,
  type SyncOptions,
} from './sync-options';

/**
 * Subscribe to this scope's state events on `relays`, decode matching ones,
 * and merge their cursors into the read-state store. Returns a cleanup fn
 * that closes the subs.
 */
export function subscribeAndIngest<T>(
  opts: SyncOptions,
  apply: (payload: T, rumorCreatedAt: number) => void,
): () => void {
  const impl = getBridgeImpl();
  if (!impl) return () => {};
  // Background lane: read-state sync is invisible housekeeping. It must never
  // sit in front of a signature the user is waiting on. (`getNipSigner`
  // defaults to `interactive` because it also backs the zap/NWC flow.)
  const signer = impl.getNipSigner('background');
  if (!signer) return () => {};

  // Track newest seen so we don't re-apply older wraps that arrive late
  // from a different relay (DM scope subscribes to multiple relays).
  let newestApplied = 0;
  const cacheKind = cacheKindFor(opts.transport);

  // Stale-while-revalidate: paint cached snapshot first.
  for (const relay of opts.relays) {
    const cached = cacheGet<{ payload: T; createdAt: number }>(relay, cacheKind, opts.dTag);
    if (cached && cached.value.createdAt > newestApplied) {
      apply(cached.value.payload, cached.value.createdAt);
      newestApplied = cached.value.createdAt;
    }
  }

  const unsubFns: Array<() => void> = [];
  /** Cleaned up: an open waiting for the DM unlock is dropped. */
  let stopped = false;

  // Replaceable transport: ask for exactly our own event. One event back, one
  // decrypt. The gift-wrap path below can only filter on `#p`, so it receives
  // every wrap addressed to the user (overwhelmingly real NIP-17 DMs) and
  // pays two signer round-trips each to discard them.
  if (opts.transport === 'replaceable') {
    const filter: Filter = { kinds: [KIND_INNER], authors: [signer.pubkey], '#d': [opts.dTag] };
    for (const relay of opts.relays) {
      const unsub = impl.subscribeFilterWatched(filter, async (ev) => {
        if (ev.created_at <= newestApplied) return;
        let payload: T | null = null;
        try {
          payload = JSON.parse(await signer.nip44Decrypt(signer.pubkey, ev.content)) as T;
        } catch {
          // Written by a different app under the same d tag, or a payload we
          // cannot read. Ignore rather than throw: this is background sync.
          return;
        }
        if (!payload || (payload as { v?: number }).v !== 1) return;
        apply(payload, ev.created_at);
        newestApplied = ev.created_at;
        cacheSet(relay, KIND_INNER, opts.dTag, { payload, createdAt: ev.created_at });
      }, { relays: [relay], watchdogMs: READ_STATE_WATCHDOG_MS });
      unsubFns.push(unsub);
    }

    // Migration: nothing else to do unless we are still reading old wraps.
    if (!opts.alsoReadLegacyWraps) {
      return () => unsubFns.forEach((fn) => fn());
    }
  }

  const filter: Filter = { kinds: [KIND_GIFT_WRAP], '#p': [signer.pubkey] };
  for (const relay of opts.relays) {
    const open = async (ev: NostrEvent): Promise<void> => {
      // Checked again after a wait: the DM unlock may have stored it meanwhile.
      if (hasSeenWrap(opts.ledgerScope, ev.id)) return;
      if (impl.isStoredDmWrap(ev.id)) { markWrapSeen(opts.ledgerScope, ev.id); return; }
      const rumor = await unwrapForSelf(ev, signer);
      if (!rumor) return;
      // Marked before the filters, not after: "not my scope's rumor" is a
      // permanent property of an immutable event, and it is precisely the
      // verdict we don't want to re-buy every reload.
      markWrapSeen(opts.ledgerScope, ev.id);
      if (rumor.kind !== KIND_INNER) return;
      if (findInnerDTag(rumor) !== opts.dTag) return;
      if (rumor.created_at <= newestApplied) return;
      const payload = parsePayload<T>(rumor);
      if (!payload) return;
      apply(payload, rumor.created_at);
      newestApplied = rumor.created_at;
      cacheSet(relay, cacheKind, opts.dTag, { payload, createdAt: rumor.created_at });
    };
    const unsub = impl.subscribeFilterWatched(filter, (ev) => {
      // The `#p`-only filter delivers every gift wrap addressed to us,
      // overwhelmingly NIP-17 DMs, which this scope opens (two signer
      // round-trips) only to discard on the `kind`/`d` checks below. Skip the
      // ones a previous session already classified, and the ones the
      // encrypted DM store holds: those are DMs, not read state.
      if (hasSeenWrap(opts.ledgerScope, ev.id)) return;
      if (impl.isStoredDmWrap(ev.id)) { markWrapSeen(opts.ledgerScope, ev.id); return; }
      // While DMs are on and locked, opening a wrap would ask the signer
      // before the person asked for anything, and would decrypt their own
      // sent DMs (self-copies are self-authored too). Wait for the unlock.
      if (impl.deferUntilDmsUnlocked(() => { if (!stopped) void open(ev); })) return;
      void open(ev);
    }, { relays: [relay], watchdogMs: READ_STATE_WATCHDOG_MS });
    unsubFns.push(unsub);
  }
  return () => {
    stopped = true;
    unsubFns.forEach((fn) => fn());
  };
}
