'use client';

import { useEffect, useRef, useState } from 'react';
import type { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getNDK, connectNDK, restoreRemoteSigner } from '@/lib/nostr';

type Router = ReturnType<typeof useRouter>;

/**
 * Bundles the three mount-time auth effects:
 *   1. Validate the backend session (with a ref guard so it only runs once).
 *   2. Redirect to `/` if the user clears their auth store mid-session.
 *   3. Restore the NDK connection + signer in the background.
 *
 * Keeps the original effect ordering so the socket effect (which depends on
 * `sessionChecked`) still sees the same ready-states at the same times.
 */
export function useSessionBootstrap(router: Router) {
  const { profile, logout, restoreSession } = useAuthStore();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const sessionCheckStarted = useRef(false);
  const [ndkReady, setNdkReady] = useState(false);

  // If the user disconnects mid-session (Navbar → Disconnect clears the auth
  // store), bounce them to the landing page instead of leaving them on /chat
  // where unauthenticated calls (e.g. Join Default Server) would 401.
  useEffect(() => {
    if (!sessionChecked) return;
    if (!profile?.pubkey) {
      router.push('/');
    }
  }, [sessionChecked, profile?.pubkey, router]);

  // On mount, validate session with backend. If no valid session, redirect to landing.
  useEffect(() => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;

    restoreSession().then(async (valid) => {
      if (!valid) {
        setSessionInvalid(true);
        return;
      }
      // Let the page render immediately — NDK connects in background
      setSessionChecked(true);
    });
  }, [restoreSession, router]);

  // Restore NDK connection + signer in background (non-blocking)
  useEffect(() => {
    if (!sessionChecked) return;

    const loginMethod = useAuthStore.getState().loginMethod;
    const ndk = getNDK();

    connectNDK().then(async () => {
      if (!ndk.signer && loginMethod === 'extension' && typeof window !== 'undefined' && window.nostr) {
        const { NDKNip07Signer } = await import('@nostr-dev-kit/ndk');
        ndk.signer = new NDKNip07Signer(4000, ndk);
      }
      // nsec / bunker / NostrConnect: rebuild the signer from the payload
      // stashed in localStorage at login. Without this the signer dies on
      // every reload (or mobile background eviction) and the user gets
      // silently logged out.
      if (!ndk.signer && (loginMethod === 'nsec' || loginMethod === 'bunker')) {
        const ok = await restoreRemoteSigner();
        if (!ok) {
          console.warn(`[chat] ${loginMethod} signer restore failed`);
          if (loginMethod === 'nsec') {
            logout();
            setSessionChecked(false);
            setSessionInvalid(true);
            return;
          }
        }
      }
      setNdkReady(true);
    }).catch((err) => {
      console.warn('Failed to restore NDK connection:', err);
      setNdkReady(true); // still mark ready so DM UI doesn't hang
    });
  }, [sessionChecked, logout]);

  return {
    sessionChecked,
    sessionInvalid,
    ndkReady,
    setSessionChecked,
    setSessionInvalid,
    sessionCheckStartedRef: sessionCheckStarted,
  };
}
