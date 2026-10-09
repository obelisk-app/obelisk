/**
 * The write half of the read-state sync: watch the stores for changes that
 * affect one scope and publish its state, debounced, flushing early when the
 * page hides or the sync stops. See `relay-sync.ts` for why the two scopes
 * use different transports and the two traps the gift-wrap branch avoids.
 */
import { getBridgeImpl, cacheSet } from '@/services/nostr-bridge';
import { wrapForSelf } from '@/services/read-state/gift-wrap';
import { useReadStateStore } from '@/store/read-state';
import { useNotificationsStore } from '@/store/notifications';
import { KIND_NIP78_APP_DATA as KIND_INNER } from '@/constants/nostr/nip-kinds';
import { cacheKindFor, type SyncOptions } from './sync-options';
import { DEBOUNCE_MS } from '@/constants/read-state/sync-options';

type BridgeImpl = NonNullable<ReturnType<typeof getBridgeImpl>>;
type Signer = NonNullable<ReturnType<BridgeImpl['getNipSigner']>>;

/**
 * Publish this scope's current state once. Throws on publish failure; the
 * caller treats that as best-effort.
 */
async function publishState(impl: BridgeImpl, signer: Signer, opts: SyncOptions, payload: unknown, createdAt: number): Promise<void> {
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
      // `quiet`: this fires on every channel open (the cursor moves, the
      // fingerprint changes, the debounce flushes). Logging it put a
      // "Publishing to relays · kind 30078" toast on every screen, which
      // reads as the app writing settings on navigation. The gift-wrap
      // branch below has always been quiet for the same reason.
      { extraRelays: [...opts.relays], mode: 'replace', quiet: true },
    );
    return;
  }
  const wrap = await wrapForSelf(
    { kind: KIND_INNER, tags: [['d', opts.dTag]], content: JSON.stringify(payload), created_at: createdAt },
    signer,
  );
  // Must NOT go through publishEvent: that re-signs the template with the
  // user's key, replacing the throwaway wrap author and leaving the payload
  // undecryptable (the reader derives the conversation key from the wrap's
  // pubkey). `last-resort` auth for the same reason NIP-17 sends use it: an
  // AUTH would staple the real pubkey to the socket carrying a wrap built
  // not to carry it.
  await impl.publishSignedEvent(wrap, [...opts.relays], { quiet: true, authMode: 'last-resort' });
}

/**
 * Watch the read-state store for changes that affect this scope and
 * publish a fresh state event, debounced. Returns a cleanup fn.
 *
 * `selectFingerprint` must produce a stable string from the parts of the
 * store that this scope cares about. Cursors-only changes that happen
 * outside this scope (e.g. another relay's groups when watching the
 * DM scope) won't trigger a publish.
 */
export function watchAndPublish(
  opts: SyncOptions,
  selectFingerprint: () => string,
  buildPayload: () => unknown | null,
): () => void {
  const impl = getBridgeImpl();
  if (!impl) return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let flushQueued = false;
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
    if (inFlight) {
      flushQueued = true;
      return;
    }
    if (lastFingerprint === lastPublishedFingerprint) return;
    // Background lane: read-state sync is invisible housekeeping. It must never
    // sit in front of a signature the user is waiting on. (`getNipSigner`
    // defaults to `interactive` because it also backs the zap/NWC flow.)
    const signer = impl.getNipSigner('background');
    if (!signer) return;
    const payload = buildPayload();
    if (!payload) return;
    const fpAtFlush = lastFingerprint;
    const createdAt = Math.floor(Date.now() / 1000);
    inFlight = true;
    try {
      await publishState(impl, signer, opts, payload, createdAt);
      lastPublishedFingerprint = fpAtFlush;
      // Update cache so a reload paints the freshly-published state
      // even before the relay ACKs it back.
      const cacheKind = cacheKindFor(opts.transport);
      for (const relay of opts.relays) cacheSet(relay, cacheKind, opts.dTag, { payload, createdAt });
    } catch {
      // Publish errors are best-effort; the next cursor advance will
      // schedule another attempt. Avoid surfacing transient relay errors.
    } finally {
      inFlight = false;
      const followUp = flushQueued && lastFingerprint !== fpAtFlush;
      flushQueued = false;
      // Coalesce changes made during approval without retrying a rejected
      // snapshot just because switching to the signer hid the page.
      if (followUp && impl.getNipSigner('background')?.pubkey === signer.pubkey) void flush();
    }
  };

  // Eager flush: fires immediately if there's a pending publish that hasn't
  // been sent yet. Used by cleanup, visibilitychange to hidden, and pagehide
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

  // Browser lifecycle hooks: flush before the page goes away so the
  // multi-device sync converges even when the user just closes the tab.
  // `pagehide` is the most reliable on mobile Safari (which often skips
  // `beforeunload`); `visibilitychange` to hidden covers tab switches and
  // app-switch on iOS PWA. Both are no-ops in non-browser environments
  // (tests, SSR).
  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') flushNow();
  };
  const onPageHide = () => flushNow();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);

  return () => {
    storeUnsubs.forEach((fn) => fn());
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
    flushNow();
  };
}
