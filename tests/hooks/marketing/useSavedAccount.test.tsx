import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PROFILE_SYNC_CACHE_KEY } from '@/services/nostr-bridge/profile-sync-cache';
import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '@/services/nostr-bridge/session-storage';
import {
  LEGACY_SESSION_KEY,
  PROFILE_CACHE_KEY,
  SESSION_KEY,
  notifySavedAccountChanged,
  parseCachedProfile,
  parseSessionPubkey,
  useSavedAccount,
} from '@/hooks/marketing/useSavedAccount';

const ME = 'a'.repeat(64);

function session(pubKeyHex: string) {
  return JSON.stringify({ pubKeyHex, loginMethod: 'nsec', relayUrl: 'wss://r.example' });
}

function profileCache(content: Record<string, unknown>) {
  return JSON.stringify({ byPubkey: { [ME]: { content: JSON.stringify(content) } } });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('useSavedAccount keys', () => {
  it('reads the same session and profile cache keys the bridge writes', () => {
    expect(SESSION_KEY).toBe(STORAGE_KEY);
    expect(LEGACY_SESSION_KEY).toBe(LEGACY_STORAGE_KEY);
    expect(PROFILE_CACHE_KEY).toBe(PROFILE_SYNC_CACHE_KEY);
  });
});

describe('parseSessionPubkey', () => {
  it('takes a well-formed hex pubkey and rejects anything else', () => {
    expect(parseSessionPubkey(session(ME))).toBe(ME);
    expect(parseSessionPubkey(session('nothex'))).toBeNull();
    expect(parseSessionPubkey('{not json')).toBeNull();
    expect(parseSessionPubkey(null)).toBeNull();
  });
});

describe('parseCachedProfile', () => {
  it('prefers display_name, then displayName, then name', () => {
    expect(parseCachedProfile(profileCache({ display_name: 'D', displayName: 'X', name: 'n' }), ME).name).toBe('D');
    expect(parseCachedProfile(profileCache({ displayName: 'X', name: 'n' }), ME).name).toBe('X');
    expect(parseCachedProfile(profileCache({ name: 'n', picture: 'https://p.example/a.png' }), ME)).toEqual({
      name: 'n',
      picture: 'https://p.example/a.png',
    });
  });

  it('returns nulls for a missing entry, blank strings or broken JSON', () => {
    expect(parseCachedProfile(null, ME)).toEqual({ name: null, picture: null });
    expect(parseCachedProfile(profileCache({ name: '  ' }), ME).name).toBeNull();
    expect(parseCachedProfile(JSON.stringify({ byPubkey: { [ME]: { content: '{bad' } } }), ME)).toEqual({ name: null, picture: null });
  });
});

describe('useSavedAccount', () => {
  it('is null with nothing saved', () => {
    const { result } = renderHook(() => useSavedAccount());
    expect(result.current).toBeNull();
  });

  it('returns the saved pubkey with the cached name and picture', () => {
    localStorage.setItem(STORAGE_KEY, session(ME));
    localStorage.setItem(PROFILE_CACHE_KEY, profileCache({ name: 'Ana', picture: 'https://p.example/a.png' }));
    const { result } = renderHook(() => useSavedAccount());
    expect(result.current).toEqual({ pubkey: ME, name: 'Ana', picture: 'https://p.example/a.png' });
  });

  it('reads the legacy session key and a session kept in sessionStorage', () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, session(ME));
    expect(renderHook(() => useSavedAccount()).result.current?.pubkey).toBe(ME);
    localStorage.clear();
    sessionStorage.setItem(STORAGE_KEY, session(ME));
    act(() => notifySavedAccountChanged());
    expect(renderHook(() => useSavedAccount()).result.current?.pubkey).toBe(ME);
  });

  it('keeps the same object between renders while storage is unchanged', () => {
    localStorage.setItem(STORAGE_KEY, session(ME));
    const { result, rerender } = renderHook(() => useSavedAccount());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('updates when this tab notifies a change', () => {
    localStorage.setItem(STORAGE_KEY, session(ME));
    const { result } = renderHook(() => useSavedAccount());
    expect(result.current?.pubkey).toBe(ME);
    localStorage.removeItem(STORAGE_KEY);
    act(() => notifySavedAccountChanged());
    expect(result.current).toBeNull();
  });
});
