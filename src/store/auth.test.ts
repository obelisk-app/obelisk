import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './auth';

// Mock nostr module
vi.mock('@/lib/nostr', () => ({
  parseProfile: vi.fn((user: any) => ({
    pubkey: user.pubkey,
    npub: 'npub1test',
    name: user.profile?.name,
    displayName: user.profile?.displayName,
  })),
  resetUserRelays: vi.fn(),
}));

// Mock fetch for logout
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState());
    vi.clearAllMocks();
  });

  it('starts logged out', () => {
    const state = useAuthStore.getState();
    expect(state.isConnected).toBe(false);
    expect(state.user).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.loginMethod).toBeNull();
    expect(state.error).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state._hasHydrated).toBe(false);
  });

  it('setUser logs in with profile', () => {
    const mockUser = {
      pubkey: 'abc123',
      profile: { name: 'Alice', displayName: 'Alice' },
    } as any;

    useAuthStore.getState().setUser(mockUser, 'extension');
    const state = useAuthStore.getState();
    expect(state.isConnected).toBe(true);
    expect(state.user).toBe(mockUser);
    expect(state.loginMethod).toBe('extension');
    expect(state.profile).toBeTruthy();
  });

  it('setUser with null logs out', () => {
    useAuthStore.getState().setUser({ pubkey: 'abc' } as any, 'nsec');
    useAuthStore.getState().setUser(null, null);
    expect(useAuthStore.getState().isConnected).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('setLoading updates loading state', () => {
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);
  });

  it('setError sets error and clears loading', () => {
    useAuthStore.getState().setLoading(true);
    useAuthStore.getState().setError('Something went wrong');
    const state = useAuthStore.getState();
    expect(state.error).toBe('Something went wrong');
    expect(state.isLoading).toBe(false);
  });

  it('logout resets all state and calls API', () => {
    useAuthStore.getState().setUser({ pubkey: 'abc' } as any, 'extension');
    useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.isConnected).toBe(false);
    expect(state.user).toBeNull();
    expect(state.profile).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
  });

  it('setHasHydrated updates hydration flag', () => {
    useAuthStore.getState().setHasHydrated(true);
    expect(useAuthStore.getState()._hasHydrated).toBe(true);
  });

  it('starts with isSyncing false', () => {
    expect(useAuthStore.getState().isSyncing).toBe(false);
  });

  it('syncProfile fetches from relay endpoint and updates profile', async () => {
    // Set initial profile first
    useAuthStore.getState().setUser({
      pubkey: 'abc123',
      profile: { name: 'Alice' },
    } as any, 'extension');

    // Now stub fetch for the sync call
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        pubkey: 'abc123',
        displayName: 'Updated Alice',
        picture: 'https://example.com/pic.jpg',
        nip05: 'alice@example.com',
        about: 'Hello',
        banner: null,
        lud16: null,
        website: null,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await useAuthStore.getState().syncProfile();

    const state = useAuthStore.getState();
    expect(state.isSyncing).toBe(false);
    expect(state.profile?.displayName).toBe('Updated Alice');
    expect(state.profile?.picture).toBe('https://example.com/pic.jpg');
    expect(mockFetch).toHaveBeenCalledWith('/api/members/me/sync-nostr', { method: 'POST' });
  });

  it('restoreSession triggers syncProfile in background', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          pubkey: 'abc123',
          displayName: 'Alice',
          picture: null,
          nip05: null,
          role: 'member',
        }),
      })
      // syncProfile call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          pubkey: 'abc123',
          displayName: 'Alice Updated',
          picture: 'https://pic.jpg',
          nip05: null,
          about: null,
          banner: null,
          lud16: null,
          website: null,
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const result = await useAuthStore.getState().restoreSession();
    expect(result).toBe(true);
    expect(useAuthStore.getState().isConnected).toBe(true);
    // syncProfile was called (second fetch)
    expect(mockFetch).toHaveBeenCalledWith('/api/members/me/sync-nostr', { method: 'POST' });
  });
});
