/**
 * The account saved in this browser, as an external store the marketing
 * pages subscribe to (`useSavedAccount`): read from the session record and
 * the profile cache in storage, re-read on a `storage` event from another
 * tab or when this tab says it changed the session itself.
 */
import { LEGACY_SESSION_KEY, PROFILE_CACHE_KEY, SESSION_KEY } from '@/constants/marketing/saved-account';
import { parseCachedProfile, parseSessionPubkey, type SavedAccount } from '@/utils/marketing/saved-account';

function readItem(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function readSessionRaw(): string | null {
  return readItem(SESSION_KEY) ?? readItem(LEGACY_SESSION_KEY);
}

let lastSession: string | null = null;
let lastProfile: string | null = null;
let lastValue: SavedAccount | null = null;

/** Re-parses only when one of the two stored strings changed, so the snapshot is stable. */
export function savedAccountSnapshot(): SavedAccount | null {
  const session = readSessionRaw();
  const pubkey = parseSessionPubkey(session);
  const profile = pubkey ? readItem(PROFILE_CACHE_KEY) : null;
  if (session === lastSession && profile === lastProfile) return lastValue;
  lastSession = session;
  lastProfile = profile;
  lastValue = pubkey ? { pubkey, ...parseCachedProfile(profile, pubkey) } : null;
  return lastValue;
}

/** Null on the server and in the first client render, so the server HTML and hydration agree. */
export function serverSavedAccountSnapshot(): SavedAccount | null {
  return null;
}

const listeners = new Set<() => void>();

export function subscribeSavedAccount(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

/** Re-read after this tab changed the session itself (a `storage` event only reaches other tabs). */
export function notifySavedAccountChanged(): void {
  for (const listener of listeners) listener();
}
