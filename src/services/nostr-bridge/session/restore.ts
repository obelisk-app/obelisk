/**
 * The page-reload rehydration (round 4 plan, step 18): the relay rail, then
 * the stored session, painted from the cache and reconnected before the
 * login gate opens. It repeats the install steps `LoginModule.finalizeLogin`
 * takes rather than calling it (AGENTS.md "Auth"). Pure move from
 * `client.ts` (`initialize`).
 */
import { ensureNotificationsStoreForAccount, useNotificationsStore } from '@/store/notifications';
import { ensureChannelPrefsStoreForAccount } from '@/store/channel-prefs';
import { DEFAULT_RELAY, isImportableRelayUrl, normalizeConfiguredRelayUrl } from '../relay-list';
import { LEGACY_STORAGE_KEY, STORAGE_KEY, readMigrated } from '../session-storage';
import { resetWrapLedger } from '../wrap-ledger';
import type { LifecycleTargets } from './lifecycle';
import type { LoginDeps } from './login';
import type { SessionPersistence } from './persistence';

export interface RestoreDeps extends Pick<LoginDeps, 'connect' | 'restoreConfiguredRelays' | 'ensureRelayInList'> {
  /** The record on disk: opens the sealed secrets, migrates a plaintext record, writes it back. */
  store: Pick<SessionPersistence, 'load' | 'persist'>;
}

export async function restoreSession(t: LifecycleTargets, deps: RestoreDeps): Promise<void> {
  const { state } = t;
  deps.restoreConfiguredRelays();
  const raw = readMigrated(STORAGE_KEY, LEGACY_STORAGE_KEY);
  if (!raw) return;
  try {
    // Opens the vault before connect(): a reload during the handshake must
    // find a sealed record, never a half-migrated one. Null when the vault
    // could not open it; the record is gone and `sessionNotice` says why.
    // Awaited only when there is a vault to wait for (see `load`).
    const loaded = deps.store.load(raw);
    const parsed = loaded instanceof Promise ? await loaded : loaded;
    if (!parsed) return;
    const storedRelayUrl = parsed.relayUrl;
    parsed.relayUrl = normalizeConfiguredRelayUrl(parsed.relayUrl);
    if (!isImportableRelayUrl(parsed.relayUrl)) parsed.relayUrl = DEFAULT_RELAY;
    state.session = parsed;
    if (parsed.relayUrl !== storedRelayUrl) deps.store.persist();
    t.browserEvents.wire();
    state.currentRelayUrl.set(parsed.relayUrl);
    state.relays = [parsed.relayUrl];
    // Make sure the session relay is in the configured list.
    deps.ensureRelayInList(parsed.relayUrl);
    // Same two steps finalizeLogin takes, and for the same reason, this
    // page-reload path doesn't go through it. Without them the first
    // kind-9 backfill lands in the unscoped store AND with no floor, so
    // every historical mention on the relay became an unread card whose
    // message is far up in history and can never be "seen".
    ensureNotificationsStoreForAccount(parsed.pubKeyHex);
    ensureChannelPrefsStoreForAccount(parsed.pubKeyHex);
    useNotificationsStore.getState().registerRelay(parsed.relayUrl);
    // The other two steps finalizeLogin takes before connect(): the seen-wrap
    // ledger and the encrypted DM store, pointed at this account. The reload
    // path used to skip the ledger, so after a reload it remembered nothing
    // and every gift wrap was opened again.
    resetWrapLedger(parsed.pubKeyHex);
    t.dmStore.attach(parsed.pubKeyHex);
    // Seed the stores from localStorage so the sidebar paints last-known
    // state instantly while the live REQs catch up. Stale-while-revalidate:
    // arriving relay events overwrite via each module's newest-wins ingest.
    const hasRenderableCache = t.seedCacheForRelay(parsed.relayUrl);
    // For NIP-46 (bunker) sessions: pre-warm the BunkerSigner so the first
    // NIP-42 AUTH challenge from the relay doesn't trigger a cold
    // BunkerSigner.fromBunker + first RPC round-trip from inside
    // the auth-signing callback. Many relays time out the AUTH window
    // before the cold path completes, the REQ is dropped silently, the
    // watchdog retries, and the user sees the "needs 2-3 refreshes" bug.
    // Fire-and-forget on purpose: a flaky bunker relay must not block
    // chat render, the lazy fallback in the AUTH signer still works.
    if (parsed.loginMethod === 'bunker') {
      void t.bunker.ensure()
        .then(() => t.bunker.ready.set(true))
        .catch((err) => {
          console.warn(
            '[bridge] bunker pre-warm failed; will retry lazily on first AUTH',
            err,
          );
        });
    }
    // Order matters: connect() opens subscriptions, then we flip the gate.
    // If we set isLoggedIn=true first, AppShell mounts and fires per-group
    // REQs against an unauthenticated socket, relays drop them silently
    // and the user is left needing 2-3 manual refreshes. See finalizeLogin
    // and docs/data-system.md.
    try {
      await deps.connect();
    } catch {
      // First connect attempt failed (relay unreachable, AUTH timeout,
      // etc.). Keep the session in memory: the hub holds the socket and
      // retries with its capped, jittered backoff, its registry holds the
      // REQs the fan-out queued and issues them when the socket opens,
      // and `onHubStatus` flips the login gate on the `connected`
      // report, so the user doesn't have to refresh. If the seed found
      // renderable channel state, keep the cached shell mounted;
      // otherwise leave the app behind useIsRehydrating so a cache-free
      // user never sees an empty chat shell as the "successful" first paint.
      if (hasRenderableCache) {
        state.myPubkey.set(parsed.pubKeyHex);
        state.myLoginMethod.set(parsed.loginMethod);
        state.isLoggedIn.set(true);
      }
      return;
    }
    state.myPubkey.set(parsed.pubKeyHex);
    state.myLoginMethod.set(parsed.loginMethod);
    state.isLoggedIn.set(true);
    void t.profiles.syncOwn('login');
  } catch {
    // Corrupt storage: drop both the current and legacy session entries so
    // `useIsRehydrating` doesn't latch true forever on the next paint
    // (the LoginModal would never appear and the user would be locked out
    // looking at a permanent "Reconnecting…" screen).
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  }
}
