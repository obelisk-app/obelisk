/**
 * The signed-in look of the marketing pages, read from what the app saved in
 * this browser, without loading the Nostr bridge.
 *
 * The landing page only needs to know "is someone signed in here, and what is
 * their name and picture". The bridge answers that by connecting to relays,
 * which made every visitor to the marketing site download it. The app already
 * keeps both facts in localStorage: the session record (`obelisk-dex/session`)
 * and the kind 0 profile cache. Reading them is enough.
 *
 * The three storage keys are copied rather than imported: code outside the
 * bridge may only enter it through `@/services/nostr-bridge`, which is the
 * whole bridge. `tests/hooks/marketing/useSavedAccount.test.tsx` pins each
 * copy to the bridge's own export, so they cannot drift apart.
 */
import { useSyncExternalStore } from 'react';

export const SESSION_KEY = 'obelisk-dex/session';
export const LEGACY_SESSION_KEY = 'obeliskord/session';
export const PROFILE_CACHE_KEY = 'obelisk/profile-sync-cache/v1';

export interface SavedAccount {
  pubkey: string;
  /** Display name, then name, from the cached profile; null when none is cached. */
  name: string | null;
  picture: string | null;
}

const HEX_PUBKEY = /^[0-9a-f]{64}$/;

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

function parseObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** The saved session's pubkey, or null when no well-formed session is saved. */
export function parseSessionPubkey(raw: string | null): string | null {
  const pubkey = parseObject(raw)?.pubKeyHex;
  return typeof pubkey === 'string' && HEX_PUBKEY.test(pubkey) ? pubkey : null;
}

/** Name and picture of `pubkey` from the profile cache's kind 0 content. */
export function parseCachedProfile(raw: string | null, pubkey: string): Pick<SavedAccount, 'name' | 'picture'> {
  const byPubkey = parseObject(raw)?.byPubkey;
  const event = byPubkey && typeof byPubkey === 'object' ? (byPubkey as Record<string, unknown>)[pubkey] : null;
  const content = event && typeof event === 'object' ? (event as Record<string, unknown>).content : null;
  const meta = parseObject(typeof content === 'string' ? content : null) ?? {};
  return {
    name: text(meta.display_name) ?? text(meta.displayName) ?? text(meta.name),
    picture: text(meta.picture),
  };
}

let lastSession: string | null = null;
let lastProfile: string | null = null;
let lastValue: SavedAccount | null = null;

/** Re-parses only when one of the two stored strings changed, so the snapshot is stable. */
function getSnapshot(): SavedAccount | null {
  const session = readSessionRaw();
  const pubkey = parseSessionPubkey(session);
  const profile = pubkey ? readItem(PROFILE_CACHE_KEY) : null;
  if (session === lastSession && profile === lastProfile) return lastValue;
  lastSession = session;
  lastProfile = profile;
  lastValue = pubkey ? { pubkey, ...parseCachedProfile(profile, pubkey) } : null;
  return lastValue;
}

function getServerSnapshot(): SavedAccount | null {
  return null;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
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

/**
 * The account saved in this browser, or null. Null on the server and in the
 * first client render, so the server HTML and hydration agree.
 */
export function useSavedAccount(): SavedAccount | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
