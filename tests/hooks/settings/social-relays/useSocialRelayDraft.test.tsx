vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock({
    useMyPubkey: () => pubkey,
  });
});
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved: { socialRelays: string[] } = { socialRelays: ['wss://relay.damus.io'] };
const setPreference = vi.fn();
const importNip65Relays = vi.fn(async (): Promise<string[]> => []);
const applySocialRelays = vi.fn();
const watchRelays = vi.fn();
let pubkey: string | null = 'f'.repeat(64);

vi.mock('@/services/preferences/preferences', () => ({
  setPreference: (key: string, value: unknown) => setPreference(key, value),
}));
vi.mock('@/hooks/preferences/usePreferences', () => ({
  usePreferences: () => saved,
}));
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({  });
});
vi.mock('@/services/social/pool', () => ({
  applySocialRelays: (r: string[]) => applySocialRelays(r),
  importNip65Relays: () => importNip65Relays(),
}));
const NO_STATUSES = Object.freeze({});
vi.mock('@/services/social/relay-status', () => ({
  getRelayStatuses: () => NO_STATUSES,
  subscribeRelayStatus: () => () => {},
  watchRelays: (r: string[]) => watchRelays(r),
}));

import { useSocialRelayDraft } from '@/hooks/settings/social-relays/useSocialRelayDraft';
import { relayKey } from '@/utils/settings/social-relays';
import { DEFAULT_SOCIAL_RELAYS } from '@/constants/social/relays';

describe('relayKey', () => {
  it('trims and drops one trailing slash', () => {
    expect(relayKey('  wss://a.example/ ')).toBe('wss://a.example');
  });
});

describe('useSocialRelayDraft', () => {
  beforeEach(() => {
    saved.socialRelays = ['wss://relay.damus.io'];
    pubkey = 'f'.repeat(64);
    vi.clearAllMocks();
  });

  it('starts from the saved list and watches it', () => {
    const { result } = renderHook(() => useSocialRelayDraft());
    expect(result.current.draft).toEqual(['wss://relay.damus.io']);
    expect(result.current.status).toBe('idle');
    expect(watchRelays).toHaveBeenCalledWith(['wss://relay.damus.io']);
  });

  it('refuses to save an invalid row and saves a valid list', () => {
    const { result } = renderHook(() => useSocialRelayDraft());
    act(() => result.current.update(0, 'https://nope'));
    expect(result.current.invalid.has(0)).toBe(true);
    act(() => result.current.save());
    expect(result.current.status).toBe('invalid');
    expect(setPreference).not.toHaveBeenCalled();
    act(() => result.current.update(0, 'wss://nos.lol'));
    act(() => result.current.save());
    expect(result.current.status).toBe('saved');
    expect(setPreference).toHaveBeenCalledWith('socialRelays', expect.arrayContaining(['wss://nos.lol']));
    expect(applySocialRelays).toHaveBeenCalled();
  });

  it('addBlank then addPreset fills the blank row instead of appending', () => {
    const { result } = renderHook(() => useSocialRelayDraft());
    act(() => result.current.addBlank());
    act(() => result.current.addPreset('wss://nos.lol'));
    expect(result.current.draft).toEqual(['wss://relay.damus.io', 'wss://nos.lol']);
    act(() => result.current.addPreset('wss://nos.lol'));
    expect(result.current.draft).toHaveLength(2);
  });

  it('remove and reset', () => {
    const { result } = renderHook(() => useSocialRelayDraft());
    act(() => result.current.addPreset('wss://nos.lol'));
    act(() => result.current.remove(0));
    expect(result.current.draft).toEqual(['wss://nos.lol']);
    act(() => result.current.reset());
    expect(result.current.draft).toEqual([...DEFAULT_SOCIAL_RELAYS]);
  });

  it('imports NIP-65 relays, or reports an empty import', async () => {
    const { result } = renderHook(() => useSocialRelayDraft());
    await act(async () => { await result.current.importFromNip65(); });
    expect(result.current.status).toBe('import-empty');
    importNip65Relays.mockResolvedValueOnce(['wss://x.example']);
    await act(async () => { await result.current.importFromNip65(); });
    expect(result.current.draft).toEqual(['wss://x.example']);
    expect(result.current.status).toBe('idle');
  });

  it('cannot import without a signed-in key', () => {
    pubkey = null;
    const { result } = renderHook(() => useSocialRelayDraft());
    expect(result.current.canImport).toBe(false);
  });
});
