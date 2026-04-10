import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { NostrProfile, parseProfile, LoginMethod, resetUserRelays } from '@/lib/nostr';

interface AuthState {
  isConnected: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  user: NDKUser | null;
  profile: NostrProfile | null;
  loginMethod: LoginMethod | null;
  error: string | null;
  _hasHydrated: boolean;

  setUser: (user: NDKUser | null, method: LoginMethod | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
  setHasHydrated: (hydrated: boolean) => void;
  restoreSession: () => Promise<boolean>;
  syncProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isConnected: false,
      isLoading: false,
      isSyncing: false,
      user: null,
      profile: null,
      loginMethod: null,
      error: null,
      _hasHydrated: false,

      setUser: (user, method) => {
        if (user) {
          set({
            isConnected: true,
            user,
            profile: parseProfile(user),
            loginMethod: method,
            error: null,
          });
        } else {
          set({
            isConnected: false,
            user: null,
            profile: null,
            loginMethod: null,
          });
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error, isLoading: false }),

      logout: () => {
        fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        resetUserRelays();
        set({
          isConnected: false,
          user: null,
          profile: null,
          loginMethod: null,
          error: null,
        });
      },

      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),

      // Fetch fresh profile from Nostr relays and sync to DB
      syncProfile: async () => {
        set({ isSyncing: true });
        try {
          const res = await fetch('/api/members/me/sync-nostr', { method: 'POST' });
          if (!res.ok) return;
          const data = await res.json();
          const currentProfile = get().profile;
          set({
            profile: currentProfile ? {
              ...currentProfile,
              name: data.displayName || currentProfile.name,
              displayName: data.displayName || currentProfile.displayName,
              picture: data.picture || currentProfile.picture,
              nip05: data.nip05 || currentProfile.nip05,
              about: data.about || currentProfile.about,
              banner: data.banner || currentProfile.banner,
              lud16: data.lud16 || currentProfile.lud16,
              website: data.website || currentProfile.website,
            } : {
              pubkey: data.pubkey,
              npub: '',
              displayName: data.displayName,
              picture: data.picture,
              nip05: data.nip05,
              about: data.about,
              banner: data.banner,
              lud16: data.lud16,
              website: data.website,
            },
          });
        } catch {
          // silent — sync is best-effort
        } finally {
          set({ isSyncing: false });
        }
      },

      // Check backend session cookie — used on page load to restore session
      restoreSession: async () => {
        try {
          const res = await fetch('/api/auth/me');
          if (!res.ok) {
            set({ isConnected: false });
            return false;
          }
          const data = await res.json();
          // Restore profile from backend data
          const currentProfile = get().profile;
          set({
            isConnected: true,
            profile: currentProfile ? {
              ...currentProfile,
              displayName: data.displayName || currentProfile.displayName,
              picture: data.picture || currentProfile.picture,
              nip05: data.nip05 || currentProfile.nip05,
            } : {
              pubkey: data.pubkey,
              npub: '',
              displayName: data.displayName,
              picture: data.picture,
              nip05: data.nip05,
            },
          });
          // If the DB has no cached profile for us yet (new user, first
          // login after join), block on the Nostr relay sync so the UI
          // never flashes blank. Otherwise refresh in the background.
          const hasCachedProfile =
            !!(data.displayName || data.picture || currentProfile?.displayName || currentProfile?.picture);
          if (hasCachedProfile) {
            void get().syncProfile();
          } else {
            await get().syncProfile();
          }
          return true;
        } catch {
          set({ isConnected: false });
          return false;
        }
      },
    }),
    {
      name: 'nostr-auth',
      // Do NOT persist isConnected — always validate with backend on page load
      partialize: (state) => ({
        loginMethod: state.loginMethod,
        profile: state.profile,
      }),
      onRehydrateStorage: () => {
        return (_state, error) => {
          if (!error) {
            useAuthStore.getState().setHasHydrated(true);
          }
        };
      },
    }
  )
);
