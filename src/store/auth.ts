import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { NostrProfile, parseProfile, LoginMethod, resetUserRelays, clearSignerPayload, getNDK, onSignerChange } from '@/lib/nostr';
import { resetAllClientState } from '@/lib/reset';

// Cross-tab logout sync. When any tab calls logout(), every other tab
// observing the channel mirrors the local-state clear immediately, so the
// user doesn't see one tab still rendering as signed-in until that tab
// next hits an API endpoint and 401s.
//
// We deliberately do NOT broadcast login — login establishes the session
// cookie which all tabs share, but driving signer restore from a sibling
// tab's broadcast risks racing tab-local NDK setup.
const AUTH_CHANNEL = 'obelisk:auth';
const BROADCAST_LOGOUT = { type: 'logout' as const };

let authChannel: BroadcastChannel | null = null;

function getAuthChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!authChannel) authChannel = new BroadcastChannel(AUTH_CHANNEL);
  return authChannel;
}

interface AuthState {
  isConnected: boolean;
  isLoading: boolean;
  isSyncing: boolean;
  /**
   * Reactive shadow of `getNDK().signer != null`. The NDK singleton's
   * `signer` is a plain JS module property — mutating it doesn't trigger
   * React updates. Components that gate UI on signer presence (DMList's
   * "New DM" button, anywhere we need to publish/encrypt) read this
   * instead. Updated by the login flows in `nostr.ts`, by
   * `IdentityProvider` after signer restore, and by `logout`.
   */
  signerReady: boolean;
  user: NDKUser | null;
  profile: NostrProfile | null;
  loginMethod: LoginMethod | null;
  error: string | null;
  _hasHydrated: boolean;

  setUser: (user: NDKUser | null, method: LoginMethod | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSignerReady: (ready: boolean) => void;
  logout: () => Promise<void>;
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
      signerReady: false,
      user: null,
      profile: null,
      loginMethod: null,
      error: null,
      _hasHydrated: false,

      setUser: (user, method) => {
        if (user) {
          const prevPubkey = get().user?.pubkey;
          // If a different identity was previously set in this tab, wipe
          // the prior user's client state before installing the new one —
          // otherwise their servers/messages/unreads leak across accounts.
          if (prevPubkey && prevPubkey !== user.pubkey) {
            resetAllClientState();
          }
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
      setSignerReady: (ready) => set({ signerReady: ready }),

      logout: async () => {
        // Bounded server-side destroy: `await` so we know the cookie is
        // gone before we navigate, but cap at 3s so a hung relay can't
        // strand the user on the chat page. The local state below is
        // wiped regardless of the request's outcome.
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 3000);
        try {
          await fetch('/api/auth/logout', { method: 'POST', signal: ac.signal });
        } catch (err) {
          console.warn('[auth] logout server destroy failed (clearing local state anyway):', err);
        } finally {
          clearTimeout(timer);
        }
        resetUserRelays();
        clearSignerPayload();
        resetAllClientState();
        const ndk = getNDK();
        ndk.signer = undefined;
        set({
          isConnected: false,
          signerReady: false,
          user: null,
          profile: null,
          loginMethod: null,
          error: null,
        });
        // Notify other tabs so they re-render the unauthenticated state
        // synchronously — without this, a second tab keeps the previous
        // identity until its next storage event.
        try { getAuthChannel()?.postMessage(BROADCAST_LOGOUT); } catch { /* ignore */ }
        // Hard navigation — a client-side router.push('/') was getting
        // preempted by in-flight chat-page effects and leaving the user
        // on /chat. A full reload also guarantees NDK/socket/WebRTC
        // state is fully torn down and the cleared session cookie is
        // re-read.
        if (typeof window !== 'undefined') {
          window.location.assign('/');
        }
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

      // Check backend session cookie — used on page load to restore session.
      // Identity is ALWAYS derived from the backend-validated cookie, never
      // from persisted client state. If the cookie is missing/invalid, all
      // auth state is cleared so stale localStorage can never impersonate
      // a logged-in user.
      restoreSession: async () => {
        try {
          // Retry once on 401 — after a full-page nav post-login, mobile
          // browsers can race the session cookie commit vs. this fetch.
          let res = await fetch('/api/auth/me', { cache: 'no-store' });
          if (res.status === 401) {
            await new Promise((r) => setTimeout(r, 300));
            res = await fetch('/api/auth/me', { cache: 'no-store' });
          }
          if (!res.ok) {
            set({
              isConnected: false,
              user: null,
              profile: null,
              loginMethod: null,
            });
            return false;
          }
          const data = await res.json();
          const prevPubkey = get().user?.pubkey;
          // Guard against tab-level identity switches where logout wasn't
          // called cleanly (e.g. another tab logged us in as a different
          // user and this tab is now restoring that session).
          if (prevPubkey && prevPubkey !== data.pubkey) {
            resetAllClientState();
          }
          const ndk = getNDK();
          const user = ndk.getUser({ pubkey: data.pubkey });
          const npub = (() => { try { return user.npub; } catch { return ''; } })();
          set({
            isConnected: true,
            user,
            profile: {
              pubkey: data.pubkey,
              npub,
              displayName: data.displayName,
              picture: data.picture,
              nip05: data.nip05,
            },
          });
          // If the DB has no cached profile for us yet (new user, first
          // login after join), block on the Nostr relay sync so the UI
          // never flashes blank. Otherwise refresh in the background.
          const hasCachedProfile = !!(data.displayName || data.picture);
          if (hasCachedProfile) {
            void get().syncProfile();
          } else {
            await get().syncProfile();
          }
          return true;
        } catch {
          set({
            isConnected: false,
            user: null,
            profile: null,
            loginMethod: null,
          });
          return false;
        }
      },
    }),
    {
      name: 'nostr-auth',
      // Only persist loginMethod (needed to rebuild the signer on reload).
      // Identity (user/profile/isConnected) MUST come from a server-validated
      // session cookie via restoreSession — never from localStorage, or a
      // stale cache could impersonate a logged-in user.
      partialize: (state) => ({
        loginMethod: state.loginMethod,
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

// Mirror `getNDK().signer != null` into the reactive `signerReady` flag
// every time a login flow (or `restoreRemoteSigner`) installs / clears the
// signer. The bridge avoids a circular import — `nostr.ts` doesn't know
// about the auth store; it just emits to whoever subscribed.
onSignerChange((signer) => {
  useAuthStore.getState().setSignerReady(Boolean(signer));
});

// Mirror logout from sibling tabs. Carefully calls the inner clear sequence
// directly — calling logout() would re-broadcast and loop.
if (typeof window !== 'undefined') {
  const ch = getAuthChannel();
  if (ch) {
    ch.addEventListener('message', (ev) => {
      if (ev.data?.type === 'logout') {
        // Don't re-broadcast — call the inner clear sequence directly.
        // Keep this in sync with logout()'s state-clear order.
        const ndk = getNDK();
        try { ndk.signer = undefined; } catch { /* ignore */ }
        useAuthStore.setState({
          isConnected: false,
          user: null,
          profile: null,
          signerReady: false,
          isLoading: false,
          isSyncing: false,
          loginMethod: null,
        });
        try { (resetAllClientState as () => void)(); } catch { /* best-effort */ }
      }
    });
  }
}
