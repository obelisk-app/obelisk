/**
 * Session hooks: the login gate, the rehydration window, the connection and
 * relay-access state, and the signer readiness the publish paths wait on.
 */
import { useEffect, useState } from 'react';
import type { NipSigner } from '@/types/nostr/nip-signer';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import type { SessionNotice } from '../session/vault';
import type { RelayAccessState } from '../common/types';
import { useBridge } from './provider';
import { useSubscription } from './subscription';

export function useIsLoggedIn(): boolean {
  return useSubscription((b, cb) => b.subscribeIsLoggedIn(cb), false);
}

const SESSION_STORAGE_KEY = 'obelisk-dex/session';

const LEGACY_SESSION_STORAGE_KEY = 'obeliskord/session';

function hasStoredSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!(
      window.localStorage.getItem(SESSION_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY)
    );
  } catch {
    return false;
  }
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

/**
 * `true` while a stored session is being rehydrated on cold load. The bridge
 * has parsed credentials out of localStorage and is awaiting `connect()`'s
 * relay handshake, but {@link useIsLoggedIn} stays `false` until that
 * resolves (see `docs/architecture/data-system.md` §3 for the contract).
 *
 * UI consumers use this to suppress the login modal during that window,
 * without it, users navigating from the landing page back to `/app` see a
 * login modal even though their NIP-07 / nsec / bunker session is reconnecting
 * silently in the background.
 *
 * Returns `false` during SSR and the first client render to avoid a hydration
 * mismatch; on every subsequent render we read localStorage synchronously so
 * logout (which clears the entry before flipping `isLoggedIn`) doesn't briefly
 * latch into a stale "still rehydrating" state.
 */
export function useIsRehydrating(): boolean {
  const isLoggedIn = useIsLoggedIn();
  const mounted = useMounted();
  if (!mounted) return false;
  if (isLoggedIn) return false;
  return hasStoredSession();
}

export function useConnectionState(): string {
  return useSubscription((b, cb) => b.subscribeConnectionState(cb), 'Disconnected');
}

export function useCurrentRelayUrl(): string {
  return useSubscription((b, cb) => b.subscribeCurrentRelayUrl(cb), '');
}

/**
 * NIP-42 / whitelist access state for a specific relay (defaults to the
 * currently-active one). `'unknown'` until the relay either delivers an
 * event/EOSE (→ `'ok'`) or sends a CLOSED reason we can classify.
 */
export function useRelayAccess(url?: string | null): RelayAccessState {
  const current = useCurrentRelayUrl();
  const target = (url ?? current) || '';
  const map = useSubscription<Readonly<Record<string, RelayAccessState>>>(
    (b, cb) => b.subscribeRelayAccess(cb),
    {},
  );
  if (!target) return 'unknown';
  return map[normalizeRelayUrl(target)] ?? 'unknown';
}

/** Current bridge identity; null before login completes. */
export function useMyPubkey(): string | null {
  return useSubscription<string | null>((b, cb) => b.subscribeMyPubkey(cb), null);
}

/**
 * `true` once the active NIP-46 bunker signer has handshaken with its
 * bunker relay. For nsec/NIP-07 sessions this stays `false` (no external
 * signer to wait for). UI components that need a generic "ready to publish"
 * gate should use {@link useSignerReady} instead.
 */
export function useBunkerSignerReady(): boolean {
  return useSubscription((b, cb) => b.subscribeBunkerSignerReady(cb), false);
}

/**
 * The active session's login method, or `null` when logged out.
 */
export function useMyLoginMethod(): 'nsec' | 'nip07' | 'bunker' | null {
  return useSubscription<'nsec' | 'nip07' | 'bunker' | null>(
    (b, cb) => b.subscribeMyLoginMethod(cb),
    null,
  );
}

/**
 * Generic "the bridge can sign and publish events for the active user".
 * `true` for nsec/NIP-07 once logged in; for bunker it additionally requires
 * the BunkerSigner to have handshaken with its bunker relay.
 */
export function useSignerReady(): boolean {
  const loggedIn = useIsLoggedIn();
  const method = useMyLoginMethod();
  const bunkerReady = useBunkerSignerReady();
  if (!loggedIn) return false;
  if (method === 'bunker') return bunkerReady;
  return method !== null;
}

/** The session's NIP-59 signer, from the provider's bridge. */
export function useNipSigner(): NipSigner | null {
  const pubkey = useMyPubkey();
  const ready = useSignerReady();
  const bridge = useBridge();
  return pubkey && ready ? bridge?.getNipSigner() ?? null : null;
}

/**
 * What the person should be told about keeping their session, or `null`:
 * `not-remembered` (this login lives for this visit only, the browser cannot
 * keep a key), or why a reload could not restore the saved one.
 */
export function useSessionNotice(): SessionNotice | null {
  return useSubscription<SessionNotice | null>((b, cb) => b.subscribeSessionNotice(cb), null);
}

export function useConfiguredRelays(): ReadonlyArray<string> {
  return useSubscription<ReadonlyArray<string>>((b, cb) => b.subscribeConfiguredRelays(cb), []);
}
