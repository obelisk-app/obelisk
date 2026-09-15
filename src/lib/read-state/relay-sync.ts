/**
 * Encrypted multi-device read-state sync. Two scopes, two transports.
 *
 *   - **Groups state** (per relay) — a replaceable `kind:30078` addressed by
 *     `d` tag, NIP-44 encrypted to self. Published to the SINGLE relay whose
 *     groups it tracks. The relay keeps one event per (pubkey, kind, d), so
 *     cursor advances replace rather than accumulate.
 *   - **DM state** (account-global) — NIP-59 gift wrap. Published to the union
 *     of read+write relays from the user's NIP-65 (kind 10002) list. DM
 *     cursors plus `inboxLastReadAt` ride together so the bell badge syncs
 *     across devices.
 *
 * Why the split: the wrap conceals that a user runs this app on a given relay.
 * That is worth paying for on third-party NIP-65 relays. It is worth almost
 * nothing on the groups relay, which already authenticates the user over
 * NIP-42 and already publishes their membership as `kind:39002` — while the
 * cost, an unbounded event per cursor advance, is charged in full. See
 * docs/read-state.md.
 *
 * Two traps, both hit in production:
 *
 *   1. A gift wrap must be published through `publishSignedEvent`.
 *      `publishEvent` re-signs its template, which swaps the throwaway wrap
 *      author for the user's own key and leaves the payload undecryptable —
 *      the reader derives the conversation key from the wrap's pubkey.
 *   2. Gift wraps can never be deleted by their author. `wrapForSelf`
 *      generates the signing key inside the function and discards it, and
 *      NIP-09 requires a deletion be signed by the same pubkey. Nobody can
 *      issue a kind-5 for one. Do not propose it; bound the lifetime with
 *      NIP-40 or use a replaceable event.
 *
 * Both transports debounce by DEBOUNCE_MS and merge newest-wins on read; the
 * store merge is monotonic, so an out-of-order arrival cannot roll a cursor
 * backwards.
 */
import type { Filter } from 'nostr-tools';
import { getBridgeImpl } from '@/lib/nostr-bridge/client';
import { unwrapForSelf, wrapForSelf, type Rumor } from '@/lib/nip-59';
import { hasSeenWrap, markWrapSeen, type WrapLedgerScope } from '@/lib/nostr-bridge/wrap-ledger';
import { useReadStateStore, type RemoteReadState } from '@/store/read-state';
import { useNotificationsStore } from '@/store/notifications';
import { cacheGet, cacheSet } from '@/lib/nostr-bridge/cache';
import { KIND_GIFT_WRAP, KIND_NIP78_APP_DATA as KIND_INNER } from '@/lib/nip-kinds';

/** Inner rumor d-tag for groups-scope state events. */
export const D_TAG_GROUPS = 'obelisk:readstate:v1';
/** Inner rumor d-tag for DM-scope state events (also carries inboxLastReadAt). */
export const D_TAG_DMS = 'obelisk:dm-readstate:v1';

// 8s coalesces a burst of cursor advances during active reading without making
// the publish feel deferred. The previous 60s window collapsed against
// real-world usage: users read for less than a minute, then close the tab or
// navigate, and the cleanup cleared the pending timer before flush — so the
// gift wrap was never published and devices never converged. We now also
// flush eagerly on cleanup, visibilitychange→hidden, and pagehide so a partial
// debounce window doesn't lose the publish.
const DEBOUNCE_MS = 8_000;

/** Schema version for the JSON payload inside the rumor. */
const SCHEMA_VERSION = 1;

interface GroupsPayload {
  v: 1;
  groups: Record<string, { lastReadAt: number }>;
  /**
   * Relay-scoped mention read cursor (unix ms). Optional and additive —
   * `v` stays at 1 because older clients simply ignore the field and
   * newer ones treat its absence as "no remote cursor". Rides in the
   * groups-scope wrap because mentions are per-relay, exactly like the
   * group cursors around it.
   */
  mentionsReadAt?: number;
}

interface DmsPayload {
  v: 1;
  dms: Record<string, { lastReadAt: number }>;
  inboxLastReadAt: number;
}

function findInnerDTag(rumor: Rumor): string | null {
  const t = rumor.tags.find((t) => t[0] === 'd');
  return t?.[1] ?? null;
}

function parsePayload<T>(rumor: Rumor): T | null {
  try {
    const obj = JSON.parse(rumor.content) as { v?: number };
    if (obj.v !== SCHEMA_VERSION) return null;
    return obj as T;
  } catch {
    return null;
  }
}

/**
 * How long this sub waits for its first event before the watchdog calls it dead.
 *
 * Much longer than the 5s default, because this REQ is unusually expensive and
 * unusually patient-able. `{kinds:[1059], '#p':[me]}` cannot be narrowed: the
 * outer wrap is signed by a throwaway key (so `authors` is useless), NIP-59
 * fuzzes `created_at` backwards by up to two days (so `since` would drop live
 * cursors), and the wrap that carries our cursors is a needle in a haystack of
 * DM wraps (so `limit` could cut it off). Tagging our own wraps to make them
 * findable is exactly the metadata leak docs/dm-metadata-privacy.md exists to
 * prevent.
 *
 * So the query is as broad as it has to be, and on a loaded relay it can take
 * tens of seconds to return anything. Under the default watchdog that read as
 * failure: the sub was torn down at 5s and retried on a backoff, each retry
 * re-running the same expensive scan, so the cursors never arrived and every
 * channel painted unread. Nothing here is time-critical — it is invisible
 * housekeeping behind a stale-while-revalidate cache — so waiting is strictly
 * better than retrying.
 */
export const READ_STATE_WATCHDOG_MS = 60_000;

/**
 * How a scope puts its state on a relay.
 *
 * `replaceable` — a signed kind-30078 addressed by `d` tag. The relay keeps
 * exactly one per (pubkey, kind, d), so the state cannot accumulate. Used for
 * groups scope, whose target is the single relay that owns those groups and
 * already knows the user from NIP-42 auth and their kind-39002 membership.
 * Nothing is concealed by wrapping there.
 *
 * `giftwrap` — NIP-59 wrap under a throwaway key. No replaceable slot
 * announces the user's app usage. Kept for DM scope, which publishes to the
 * user's NIP-65 third-party relays where that deniability is real.
 */
type Transport = 'replaceable' | 'giftwrap';

interface SyncOptions {
  /** Where to subscribe + publish. For groups-scope this is the single home
   * relay; for DM-scope this is the NIP-65 union. */
  readonly relays: ReadonlyArray<string>;
  /** `d` tag — on the event itself when replaceable, on the inner rumor when
   * gift-wrapped. Distinguishes groups state from DM state either way. */
  readonly dTag: string;
  /** Cache key namespace under bridgeCache (per-relay). For DM scope there
   * are multiple relays — cache the merged snapshot under each one. */
  readonly cacheNamespace: string;
  /** Which slot of the wrap ledger this scope marks. Each consumer of the
   * kind-1059 stream tracks its own progress — see `wrap-ledger.ts`. */
  readonly ledgerScope: WrapLedgerScope;
  readonly transport: Transport;
  /**
   * Also ingest legacy gift wraps while migrating a scope off them, so state
   * written by an older client is not stranded. Publishing always uses
   * `transport`.
   */
  readonly alsoReadLegacyWraps?: boolean;
}

/**
 * Subscribe to incoming gift wraps on `relays`, unwrap matching rumors,
 * and merge their cursors into the read-state store. Returns a cleanup
 * fn that closes the sub.
 */
function subscribeAndIngest<T>(
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

  // Cache under the kind we publish, so a snapshot written by the previous
  // transport can never be mistaken for the current format.
  const cacheKind = opts.transport === 'replaceable' ? KIND_INNER : KIND_GIFT_WRAP;

  // Stale-while-revalidate: paint cached snapshot first.
  for (const relay of opts.relays) {
    const cached = cacheGet<{ payload: T; createdAt: number }>(
      relay, cacheKind, opts.dTag,
    );
    if (cached && cached.value.createdAt > newestApplied) {
      apply(cached.value.payload, cached.value.createdAt);
      newestApplied = cached.value.createdAt;
    }
  }

  const unsubFns: Array<() => void> = [];

  // Replaceable transport: ask for exactly our own event. One event back, one
  // decrypt. The gift-wrap path below can only filter on `#p`, so it receives
  // every wrap addressed to the user — overwhelmingly real NIP-17 DMs — and
  // pays two signer round-trips each to discard them.
  if (opts.transport === 'replaceable') {
    const filter: Filter = {
      kinds: [KIND_INNER],
      authors: [signer.pubkey],
      '#d': [opts.dTag],
    };
    for (const relay of opts.relays) {
      const unsub = impl.subscribeFilterWatched(filter, async (ev) => {
        if (ev.created_at <= newestApplied) return;
        let payload: T | null = null;
        try {
          payload = JSON.parse(
            await signer.nip44Decrypt(signer.pubkey, ev.content),
          ) as T;
        } catch {
          // Written by a different app under the same d tag, or a payload we
          // cannot read. Ignore rather than throw — this is background sync.
          return;
        }
        if (!payload || (payload as { v?: number }).v !== 1) return;
        apply(payload, ev.created_at);
        newestApplied = ev.created_at;
        cacheSet(relay, KIND_INNER, opts.dTag, {
          payload,
          createdAt: ev.created_at,
        });
      }, { relays: [relay], watchdogMs: READ_STATE_WATCHDOG_MS });
      unsubFns.push(unsub);
    }

    // Migration: nothing else to do unless we are still reading old wraps.
    if (!opts.alsoReadLegacyWraps) {
      return () => unsubFns.forEach((fn) => fn());
    }
  }

  const filter: Filter = {
    kinds: [KIND_GIFT_WRAP],
    '#p': [signer.pubkey],
  };

  for (const relay of opts.relays) {
    const unsub = impl.subscribeFilterWatched(filter, async (ev) => {
      // The `#p`-only filter delivers every gift wrap addressed to us —
      // overwhelmingly NIP-17 DMs, which this scope opens (two signer
      // round-trips) only to discard on the `kind`/`d` checks below. Skip the
      // ones a previous session already classified.
      if (hasSeenWrap(opts.ledgerScope, ev.id)) return;
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
      cacheSet(relay, cacheKind, opts.dTag, {
        payload,
        createdAt: rumor.created_at,
      });
    }, { relays: [relay], watchdogMs: READ_STATE_WATCHDOG_MS });
    unsubFns.push(unsub);
  }
  return () => unsubFns.forEach((fn) => fn());
}

/**
 * Watch the read-state store for changes that affect this scope and
 * publish a fresh gift wrap, debounced. Returns a cleanup fn.
 *
 * `selectFingerprint` must produce a stable string from the parts of the
 * store that this scope cares about. Cursors-only changes that happen
 * outside this scope (e.g. another relay's groups when watching the
 * DM scope) won't trigger a publish.
 */
function watchAndPublish(
  opts: SyncOptions,
  selectFingerprint: () => string,
  buildPayload: () => unknown | null,
): () => void {
  const impl = getBridgeImpl();
  if (!impl) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFingerprint = selectFingerprint();
  // Tracks the fingerprint that was last *published*. On flush we bump it
  // forward; if cleanup/page-hide fires while the fingerprint matches the
  // last publish, there's nothing new to push.
  let lastPublishedFingerprint = lastFingerprint;
  // Groups-scope fingerprints span two stores (cursors in read-state, the
  // mention cursor in notifications), so both are watched.
  const watchedStores = [useReadStateStore, useNotificationsStore] as const;

  const flush = async () => {
    timer = null;
    // Background lane: read-state sync is invisible housekeeping. It must never
  // sit in front of a signature the user is waiting on. (`getNipSigner`
  // defaults to `interactive` because it also backs the zap/NWC flow.)
  const signer = impl.getNipSigner('background');
    if (!signer) return;
    const payload = buildPayload();
    if (!payload) return;
    const fpAtFlush = lastFingerprint;
    const createdAt = Math.floor(Date.now() / 1000);
    const cacheKind = opts.transport === 'replaceable' ? KIND_INNER : KIND_GIFT_WRAP;

    try {
      if (opts.transport === 'replaceable') {
        // Signed normally with the user's own key: the relay must be able to
        // address it by (pubkey, kind, d) to replace the previous one.
        await impl.publishEvent(
          {
            kind: KIND_INNER,
            tags: [['d', opts.dTag]],
            content: await signer.nip44Encrypt(signer.pubkey, JSON.stringify(payload)),
            created_at: createdAt,
          },
          { extraRelays: [...opts.relays], mode: 'replace' },
        );
      } else {
        const wrap = await wrapForSelf(
          {
            kind: KIND_INNER,
            tags: [['d', opts.dTag]],
            content: JSON.stringify(payload),
            created_at: createdAt,
          },
          signer,
        );
        // Must NOT go through publishEvent: that re-signs the template with the
        // user's key, replacing the throwaway wrap author and leaving the
        // payload undecryptable — the reader derives the conversation key from
        // the wrap's pubkey. `last-resort` auth for the same reason NIP-17
        // sends use it: an AUTH would staple the real pubkey to the socket
        // carrying a wrap built not to carry it.
        await impl.publishSignedEvent(wrap, [...opts.relays], {
          quiet: true,
          authMode: 'last-resort',
        });
      }
      lastPublishedFingerprint = fpAtFlush;
      // Update cache so a reload paints the freshly-published state
      // even before the relay ACKs it back.
      for (const relay of opts.relays) {
        cacheSet(relay, cacheKind, opts.dTag, {
          payload,
          createdAt,
        });
      }
    } catch {
      // Publish errors are best-effort; the next cursor advance will
      // schedule another attempt. Avoid surfacing transient relay errors.
    }
  };

  // Eager flush — fires immediately if there's a pending publish that hasn't
  // been sent yet. Used by cleanup, visibilitychange→hidden, and pagehide
  // so closing the tab or switching devices doesn't drop the publish.
  const flushNow = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastFingerprint === lastPublishedFingerprint) return;
    void flush();
  };

  const onStoreChange = () => {
    const fp = selectFingerprint();
    if (fp === lastFingerprint) return;
    lastFingerprint = fp;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), DEBOUNCE_MS);
  };
  const storeUnsubs = watchedStores.map((s) => s.subscribe(onStoreChange));
  const unsub = () => storeUnsubs.forEach((fn) => fn());

  // Browser lifecycle hooks — flush before the page goes away so the
  // multi-device sync converges even when the user just closes the tab.
  // `pagehide` is the most reliable on mobile Safari (which often skips
  // `beforeunload`); `visibilitychange→hidden` covers tab switches and
  // app-switch on iOS PWA. Both are no-ops in non-browser environments
  // (tests, SSR).
  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') flushNow();
  };
  const onPageHide = () => flushNow();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide);
  }

  return () => {
    unsub();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onPageHide);
    }
    flushNow();
  };
}

/**
 * Start syncing groups-scope state with one relay. Returns a cleanup
 * function that stops the subscription and cancels any pending publish.
 *
 * `groupIdsForRelay` is a snapshot of which group ids belong to this
 * relay — they're the only cursors we'll publish in this scope.
 * Pass an updated snapshot by re-mounting; the engine doesn't re-read it.
 */
export function startGroupsRelaySync(
  relayUrl: string,
  groupIdsForRelay: ReadonlyArray<string>,
): () => void {
  const ids = new Set(groupIdsForRelay);
  const opts: SyncOptions = {
    relays: [relayUrl],
    dTag: D_TAG_GROUPS,
    cacheNamespace: relayUrl,
    ledgerScope: 'readstate:groups',
    transport: 'replaceable',
    // Migration window: clients that published wraps before this release still
    // have their cursors there. Drop once the fleet has turned over.
    alsoReadLegacyWraps: true,
  };

  const apply = (payload: GroupsPayload) => {
    const groupCursors: Record<string, number> = {};
    for (const [gid, entry] of Object.entries(payload.groups)) {
      if (!ids.has(gid)) continue;
      if (typeof entry?.lastReadAt === 'number') {
        groupCursors[gid] = entry.lastReadAt;
      }
    }
    if (Object.keys(groupCursors).length > 0) {
      useReadStateStore.getState().applyRemoteState({ groupCursors });
    }
    // Mention cursor converges across devices under the same max() rule as
    // the group cursors — dismiss the bell on desktop, it's dismissed on
    // the phone. Absent on wraps written by older clients.
    if (typeof payload.mentionsReadAt === 'number') {
      useNotificationsStore
        .getState()
        .applyRemoteMentionCursor(relayUrl, payload.mentionsReadAt);
    }
  };

  const unsubIngest = subscribeAndIngest(opts, apply);

  const fingerprintCursors = (cursors: Record<string, number>): string => {
    const parts: string[] = [];
    for (const gid of ids) {
      const v = cursors[gid];
      if (typeof v === 'number') parts.push(`${gid}:${v}`);
    }
    parts.sort();
    return parts.join('|');
  };

  const mentionCursor = (): number =>
    useNotificationsStore.getState().mentionCursorByRelay[relayUrl] ?? 0;

  const unsubPublish = watchAndPublish(
    opts,
    () =>
      `m:${mentionCursor()}|`
      + fingerprintCursors(useReadStateStore.getState().groupCursors),
    (): GroupsPayload | null => {
      const cursors = useReadStateStore.getState().groupCursors;
      const groups: Record<string, { lastReadAt: number }> = {};
      let any = false;
      for (const gid of ids) {
        const v = cursors[gid];
        if (typeof v === 'number' && v > 0) {
          groups[gid] = { lastReadAt: v };
          any = true;
        }
      }
      const mentionsReadAt = mentionCursor();
      if (!any && mentionsReadAt <= 0) return null;
      return mentionsReadAt > 0 ? { v: 1, groups, mentionsReadAt } : { v: 1, groups };
    },
  );

  return () => {
    unsubIngest();
    unsubPublish();
  };
}

/**
 * Start syncing DM-scope state to the user's NIP-65 relays. Inboxes
 * `inboxLastReadAt` rides along here.
 */
export function startDMRelaySync(relays: ReadonlyArray<string>): () => void {
  if (relays.length === 0) return () => {};
  const opts: SyncOptions = {
    relays,
    dTag: D_TAG_DMS,
    cacheNamespace: 'dm',
    ledgerScope: 'readstate:dms',
    // Stays gift-wrapped: this publishes to the user's NIP-65 third-party
    // relays, where not announcing app usage is worth the accumulation.
    transport: 'giftwrap',
  };

  const apply = (payload: DmsPayload) => {
    const dmCursors: Record<string, number> = {};
    for (const [peer, entry] of Object.entries(payload.dms)) {
      if (typeof entry?.lastReadAt === 'number') {
        dmCursors[peer] = entry.lastReadAt;
      }
    }
    useReadStateStore.getState().applyRemoteState({
      dmCursors,
      inboxLastReadAt: payload.inboxLastReadAt,
    });
  };

  const unsubIngest = subscribeAndIngest(opts, apply);

  const fingerprintDms = (
    cursors: Record<string, number>,
    inboxAt: number,
  ): string => {
    const parts: string[] = [];
    for (const [peer, v] of Object.entries(cursors)) {
      parts.push(`${peer}:${v}`);
    }
    parts.sort();
    return `inbox:${inboxAt}|${parts.join('|')}`;
  };

  const unsubPublish = watchAndPublish(
    opts,
    () => {
      const s = useReadStateStore.getState();
      return fingerprintDms(s.dmCursors, s.inboxLastReadAt);
    },
    (): DmsPayload | null => {
      const s = useReadStateStore.getState();
      const dms: Record<string, { lastReadAt: number }> = {};
      let any = false;
      for (const [peer, v] of Object.entries(s.dmCursors)) {
        if (typeof v === 'number' && v > 0) {
          dms[peer] = { lastReadAt: v };
          any = true;
        }
      }
      if (!any && s.inboxLastReadAt === 0) return null;
      return { v: 1, dms, inboxLastReadAt: s.inboxLastReadAt };
    },
  );

  return () => {
    unsubIngest();
    unsubPublish();
  };
}

/** Internal export for tests. */
export const __INTERNAL = {
  parsePayload,
  findInnerDTag,
  DEBOUNCE_MS,
  SCHEMA_VERSION,
};

// Suppress the unused RemoteReadState import warning — it's part of the
// public surface that the store action accepts and is referenced from
// docs/read-state.md as the apply shape.
export type { RemoteReadState };
