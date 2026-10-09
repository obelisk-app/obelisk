/**
 * The page-reload rehydration (round 4 plan, step 18): the relay rail, then
 * the stored session, painted from the cache and reconnected before the
 * login gate opens. It repeats the install steps `LoginModule.finalizeLogin`
 * takes rather than calling it (AGENTS.md "Auth"). Pure move from
 * `client.ts` (`initialize`).
 */
import { ensureNotificationsStoreForAccount, useNotificationsStore } from '@/store/notifications';
import { ensureChannelPrefsStoreForAccount } from '@/store/chat/channel-prefs';
import { isImportableRelayUrl, normalizeConfiguredRelayUrl } from '../relay/relay-list';
import { DEFAULT_RELAY } from '@/constants/nostr-bridge/relay';
import { readMigrated } from './session-storage';
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '@/constants/nostr-bridge/session';
import { resetWrapLedger } from '../cache/wrap-ledger';
import type { LifecycleTargets } from './lifecycle';
import type { LoginDeps } from './login';
import type { SessionPersistence } from './persistence';
import { installSessionIdentity } from './identity';
import { readExtensionPubkey } from './extension-identity';

export interface RestoreDeps extends Pick<LoginDeps, 'connect' | 'restoreConfiguredRelays' | 'ensureRelayInList'> {
  /** The record on disk: opens the sealed secrets, migrates a plaintext record, writes it back. */
  store: Pick<SessionPersistence, 'load' | 'persist'>;
}

export async function restoreSession(t: LifecycleTargets, deps: RestoreDeps): Promise<void> {
  const { state } = t;
  const generation = state.beginSessionOperation();
  const isCurrent = () => generation === state.sessionGeneration;
  deps.restoreConfiguredRelays();
  const raw = readMigrated(STORAGE_KEY, LEGACY_STORAGE_KEY);
  if (!raw) return;
  state.isRestoringSession.set(true);
  try {
    // Opens the vault before connect(): a reload during the handshake must
    // find a sealed record, never a half-migrated one. Null when the vault
    // could not open it; the record is gone and `sessionNotice` says why.
    // Awaited only when there is a vault to wait for (see `load`).
    const loaded = deps.store.load(raw, isCurrent);
    const parsed = loaded instanceof Promise ? await loaded : loaded;
    if (!isCurrent()) return;
    if (!parsed) {
      state.isRestoringSession.set(false);
      return;
    }
    const storedPubkey = parsed.pubKeyHex;
    if (parsed.loginMethod === 'nip07') {
      let revision = 0;
      const changed = () => { revision++; };
      window.addEventListener('nostr:accountChanged', changed);
      try {
        // The persistent account listener is wired only after installation.
        // Observe changes during this first lookup so an old response cannot
        // install the account the extension has just switched away from.
        while (isCurrent()) {
          const requestedRevision = revision;
          const pubkey = await readExtensionPubkey();
          if (!isCurrent()) return;
          if (requestedRevision !== revision) continue;
          parsed.pubKeyHex = pubkey;
          break;
        }
      } catch {
        if (!isCurrent()) return;
        // A locked or missing extension is not corrupt storage. Leave the
        // saved record available for retry, but never authenticate its old key.
        state.sessionNotice.set('extension-unverified');
        state.session = null;
        state.myPubkey.set(null);
        state.myLoginMethod.set(null);
        state.isRestoringSession.set(false);
        return;
      } finally {
        window.removeEventListener('nostr:accountChanged', changed);
      }
    }
    const storedRelayUrl = parsed.relayUrl;
    parsed.relayUrl = normalizeConfiguredRelayUrl(parsed.relayUrl);
    if (!isImportableRelayUrl(parsed.relayUrl)) parsed.relayUrl = DEFAULT_RELAY;
    state.session = parsed;
    installSessionIdentity(t);
    if (parsed.relayUrl !== storedRelayUrl || parsed.pubKeyHex !== storedPubkey) deps.store.persist();
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
        .then(() => { if (isCurrent()) t.bunker.ready.set(true); })
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
    // and docs/architecture/data-system.md.
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
      if (!isCurrent()) return;
      if (hasRenderableCache) {
        state.myPubkey.set(parsed.pubKeyHex);
        state.myLoginMethod.set(parsed.loginMethod);
        state.isLoggedIn.set(true);
        state.isRestoringSession.set(false);
      }
      return;
    }
    if (!isCurrent()) return;
    state.myPubkey.set(parsed.pubKeyHex);
    state.myLoginMethod.set(parsed.loginMethod);
    state.isLoggedIn.set(true);
    state.isRestoringSession.set(false);
    void t.profiles.syncOwn('login');
  } catch {
    if (!isCurrent()) return;
    state.isRestoringSession.set(false);
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
