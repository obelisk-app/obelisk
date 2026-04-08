import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { NostrProfile, parseProfile, LoginMethod, resetUserRelays } from '@/lib/nostr';

interface AuthState {
  isConnected: boolean;
  isLoading: boolean;
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
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isConnected: false,
      isLoading: false,
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
