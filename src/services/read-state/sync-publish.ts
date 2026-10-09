/**
 * The write half of the read-state sync: watch the stores for changes that
 * affect one scope and batch durable snapshots while the page is visible. See `relay-sync.ts` for why the two scopes
 * use different transports and the two traps the gift-wrap branch avoids.
 */
import { getBridgeImpl, cacheSet, markWrapSeen } from '@/services/nostr-bridge';
import { wrapForSelf } from '@/services/read-state/gift-wrap';
import { useReadStateStore } from '@/store/read-state';
import { useNotificationsStore } from '@/store/notifications';
import { KIND_NIP78_APP_DATA as KIND_INNER } from '@/constants/nostr/nip-kinds';
import { cacheKindFor, syncScopeKey, type SyncOptions } from './sync-options';
import { DEBOUNCE_MS, SYNC_RETRY_BASE_MS, SYNC_RETRY_MAX_MS } from '@/constants/read-state/sync-options';

import { parseSyncCursors } from '@/schemas/read-state/sync-cursors';
import { memoizeDecrypt } from '@/services/nostr-bridge';

// Active operations, not a cache: a remount must not duplicate signer approval.
const pending = new Set<string>();

type BridgeImpl = NonNullable<ReturnType<typeof getBridgeImpl>>;
type Signer = NonNullable<ReturnType<BridgeImpl['getNipSigner']>>;

/**
 * Publish this scope's current state once. Throws on publish failure; the
 * caller treats that as best-effort.
 */
async function publishState(impl: BridgeImpl, signer: Signer, opts: SyncOptions, payload: unknown, createdAt: number): Promise<void> {
  if (opts.transport === 'replaceable') {
    const plaintext = JSON.stringify(payload);
    const content = await signer.nip44Encrypt(signer.pubkey, plaintext);
    if (impl.getNipSigner('background')?.pubkey !== signer.pubkey) return;
    // The echo contains exactly the plaintext we just encrypted. Reuse the
    // existing account-cleared decrypt memo before any relay can echo it.
    await memoizeDecrypt('nip44', signer.pubkey, content, async () => plaintext);
    // Signed normally with the user's own key: the relay must be able to
    // address it by (pubkey, kind, d) to replace the previous one.
    await impl.publishEvent(
      {
        kind: KIND_INNER,
        tags: [['d', opts.dTag]],
        content,
        created_at: createdAt,
      },
      // Background cursor batches do not create navigation-time activity toasts.
      { extraRelays: [...opts.relays], mode: 'replace', quiet: true },
    );
    return;
  }
  const wrap = await wrapForSelf(
    { kind: KIND_INNER, tags: [['d', opts.dTag]], content: JSON.stringify(payload), created_at: createdAt },
    signer,
  );
  if (impl.getNipSigner('background')?.pubkey !== signer.pubkey) return;
  markWrapSeen('readstate:groups', wrap.id);
  markWrapSeen('readstate:dms', wrap.id);
  markWrapSeen('dm:inert', wrap.id);
  // Must NOT go through publishEvent: that re-signs the template with the
  // user's key, replacing the throwaway wrap author and leaving the payload
  // undecryptable (the reader derives the conversation key from the wrap's
  // pubkey). `last-resort` auth for the same reason NIP-17 sends use it: an
  // AUTH would staple the real pubkey to the socket carrying a wrap built
  // not to carry it.
  await impl.publishSignedEvent(wrap, [...opts.relays], { quiet: true, authMode: 'last-resort' });
}

/** Batch durable local cursors; teardown never starts signer work. */
export function watchAndPublish(
  opts: SyncOptions,
  selectFingerprint: () => string,
  buildPayload: () => unknown | null,
): () => void {
  const impl = getBridgeImpl();
  const owner = impl?.getNipSigner('background')?.pubkey;
  if (!impl || !owner) return () => {};
  const scope = syncScopeKey(opts, owner);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fingerprint = selectFingerprint();
  const isCurrent = () => impl.getNipSigner('background')?.pubkey === owner;
  const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const dirtyPayload = () => {
    const payload = buildPayload();
    const acknowledged = useReadStateStore.getState().syncProgress[scope]?.acknowledged ?? {};
    return Object.entries(parseSyncCursors(payload)).some(([key, value]) => value > (acknowledged[key] ?? 0)) ? payload : null;
  };
  const schedule = () => {
    if (stopped || timer || !isCurrent() || !isVisible() || !dirtyPayload()) return;
    const progress = useReadStateStore.getState().syncProgress[scope];
    // An idle first change starts a fixed batching window. Subsequent changes
    // do not postpone it, so continuous reading cannot starve sync.
    const due = Math.max(Date.now() + DEBOUNCE_MS, progress?.retryAt ?? 0);
    timer = setTimeout(() => { timer = null; void flush(); }, due - Date.now());
  };
  const flush = async () => {
    if (stopped || !isCurrent() || !isVisible()) return;
    if (pending.has(scope)) { schedule(); return; }
    const state = useReadStateStore.getState();
    if ((state.syncProgress[scope]?.retryAt ?? 0) > Date.now()) { schedule(); return; }
    const payload = dirtyPayload();
    const signer = impl.getNipSigner('background');
    if (!payload || !signer) return;
    const createdAt = Math.floor(Date.now() / 1000);
    pending.add(scope);
    state.scheduleSync(scope, Date.now() + DEBOUNCE_MS, state.syncProgress[scope]?.failures ?? 0);
    try {
      await publishState(impl, signer, opts, payload, createdAt);
      if (!isCurrent()) return;
      useReadStateStore.getState().acknowledgeSync(scope, parseSyncCursors(payload));
      useReadStateStore.getState().scheduleSync(scope, Date.now() + DEBOUNCE_MS, 0);
      for (const relay of opts.relays) cacheSet(relay, cacheKindFor(opts.transport), opts.dTag, { payload, createdAt });
    } catch {
      if (!isCurrent()) return;
      const failures = Math.min(10, (useReadStateStore.getState().syncProgress[scope]?.failures ?? 0) + 1);
      const delay = Math.min(SYNC_RETRY_MAX_MS, SYNC_RETRY_BASE_MS * 2 ** (failures - 1));
      useReadStateStore.getState().scheduleSync(scope, Date.now() + delay, failures);
    } finally {
      pending.delete(scope);
      schedule();
    }
  };
  const onChange = () => {
    const next = selectFingerprint();
    if (next === fingerprint) return;
    fingerprint = next;
    schedule();
  };
  const unsubs = [useReadStateStore.subscribe(onChange), useNotificationsStore.subscribe(onChange)];
  const onVisibility = () => {
    if (!isVisible() && timer) { clearTimeout(timer); timer = null; }
    if (isVisible()) schedule();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  // Existing local cursors not covered by an acknowledgement survive reload
  // and are batched even if no new message arrives this visit.
  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unsubs.forEach((stop) => stop());
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
  };
}
