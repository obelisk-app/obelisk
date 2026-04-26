'use client';

import { useEffect, useRef, useState } from 'react';
import type { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { getNDK, connectNDK, restoreRemoteSigner, setNDKSigner } from '@/lib/nostr';

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
      if (!ndk.signer && loginMethod === 'extension' && typeof window !== 'undefined') {
        // NIP-07 extensions inject `window.nostr` asynchronously — Alby /
        // nos2x can take 100–500ms after page load (longer on mobile).
        // Poll for up to 3s; without this, reloading the chat page raced
        // the extension and silently dropped the signer until the user
        // clicked Logout / Login again.
        let attempts = 0;
        while (!window.nostr && attempts < 30) {
          await new Promise((r) => setTimeout(r, 100));
          attempts++;
        }
        if (window.nostr) {
          const { NDKNip07Signer } = await import('@nostr-dev-kit/ndk');
          // Route through `setNDKSigner` so the bridge fires and the auth
          // store's reactive `signerReady` flag flips. Bypassing the bridge
          // here was the root cause of "Sign in to start a conversation"
          // showing in DMList even when the user was actually signed in.
          setNDKSigner(new NDKNip07Signer(4000, ndk));
        } else {
          console.warn('[chat] NIP-07 extension never injected window.nostr after 3s');
        }
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
