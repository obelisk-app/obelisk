import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub BroadcastChannel before importing the store so the module-level
// getAuthChannel() call does not throw in jsdom.
(global as any).BroadcastChannel = class {
  constructor(_name: string) {}
  postMessage() {}
  addEventListener() {}
  close() {}
};

import { useAuthStore } from './auth';
import { useChatStore } from './chat';
import { useNotificationStore } from './notification';
import { useVoiceStore } from './voice';

// Mock nostr module
vi.mock('@/lib/nostr', () => ({
  parseProfile: vi.fn((user: any) => ({
    pubkey: user.pubkey,
    npub: 'npub1test',
    name: user.profile?.name,
    displayName: user.profile?.displayName,
  })),
  resetUserRelays: vi.fn(),
  clearSignerPayload: vi.fn(),
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

  it('logout resets all state and calls API', async () => {
    useAuthStore.getState().setUser({ pubkey: 'abc' } as any, 'extension');
    await useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.isConnected).toBe(false);
    expect(state.user).toBeNull();
    expect(state.profile).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
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

  describe('account-switch client-state reset', () => {
    function seedStores() {
      useChatStore.setState({
        servers: [{ id: 's1', name: 'A', icon: null, banner: null }],
        activeServerId: 's1',
        messages: [{ id: 'm1', channelId: 'c1', authorPubkey: 'x', content: 'hi', replyToId: null, createdAt: '', editedAt: null } as any],
        memberList: [{ pubkey: 'x', displayName: 'x', picture: null } as any],
      });
      useNotificationStore.setState({
        channelUnreads: { c1: 5 },
        channelMentions: { c1: true },
      });
      useVoiceStore.setState({ currentVoiceChannelId: 'v1' });
    }

    it('logout clears chat, notification, and voice stores', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
      seedStores();
      useAuthStore.getState().setUser({ pubkey: 'abc' } as any, 'extension');
      await useAuthStore.getState().logout();

      expect(useChatStore.getState().servers).toEqual([]);
      expect(useChatStore.getState().activeServerId).toBeNull();
      expect(useChatStore.getState().messages).toEqual([]);
      expect(useChatStore.getState().memberList).toEqual([]);
      expect(useNotificationStore.getState().channelUnreads).toEqual({});
      expect(useNotificationStore.getState().channelMentions).toEqual({});
      expect(useVoiceStore.getState().currentVoiceChannelId).toBeNull();
    });

    it('setUser with a different pubkey resets client state', () => {
      useAuthStore.getState().setUser({ pubkey: 'userA' } as any, 'extension');
      seedStores();
      useAuthStore.getState().setUser({ pubkey: 'userB' } as any, 'extension');

      expect(useChatStore.getState().servers).toEqual([]);
      expect(useNotificationStore.getState().channelUnreads).toEqual({});
      expect(useAuthStore.getState().user?.pubkey).toBe('userB');
    });

    it('setUser with same pubkey does NOT wipe client state', () => {
      useAuthStore.getState().setUser({ pubkey: 'userA' } as any, 'extension');
      seedStores();
      useAuthStore.getState().setUser({ pubkey: 'userA' } as any, 'extension');

      expect(useChatStore.getState().servers.length).toBe(1);
    });

    it('restoreSession resets when the returned pubkey differs from the cached one', async () => {
      useAuthStore.getState().setUser({ pubkey: 'userA' } as any, 'extension');
      seedStores();

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            pubkey: 'userB',
            displayName: 'B',
            picture: null,
            nip05: null,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            pubkey: 'userB', displayName: 'B',
            picture: null, nip05: null, about: null, banner: null, lud16: null, website: null,
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      await useAuthStore.getState().restoreSession();
      expect(useChatStore.getState().servers).toEqual([]);
      expect(useAuthStore.getState().user?.pubkey).toBe('userB');
    });
  });
});
