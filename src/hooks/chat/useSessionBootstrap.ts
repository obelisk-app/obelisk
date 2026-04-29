'use client';

import { useEffect, useRef, useState } from 'react';
import type { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { restoreRemoteSigner } from '@/lib/nostr';
import { useSigner, useLogin } from '@nostr-wot/data/react';

type Router = ReturnType<typeof useRouter>;

/**
 * Single source of truth for session bootstrap on the chat page.
 *
 * Bundles the three mount-time auth effects:
 *   1. Validate the backend session (with a ref guard so it only runs once).
 *   2. Surface a "session expired" state if the user disconnects mid-session.
 *   3. Restore the NDK connection + signer in the background.
 *
 * (A `<IdentityProvider>` component used to exist as an alternative
 * orchestration layer but was never mounted in the app and has been
 * removed. If you need to add session bootstrap to a non-chat route,
 * extend or extract this hook rather than reintroducing a parallel path.)
 */
export function useSessionBootstrap(router: Router) {
  const { profile, logout, restoreSession } = useAuthStore();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionInvalid, setSessionInvalid] = useState(false);
  const sessionCheckStarted = useRef(false);
  const [ndkReady, setNdkReady] = useState(false);
  const signer = useSigner();
  const signerRef = useRef(signer);
  signerRef.current = signer;
  const login = useLogin();

  // If the user disconnects mid-session (Navbar → Disconnect clears the auth
  // store), surface that as a "not signed in" state instead of leaving them
  // on /chat where unauthenticated calls (e.g. Join Default Server) would
  // 401. The page-level gate then renders the login modal — gentler than a
  // sudden redirect and the user can sign back in without losing context.
  useEffect(() => {
    if (!sessionChecked) return;
    if (!profile?.pubkey) {
      setSessionInvalid(true);
    }
  }, [sessionChecked, profile?.pubkey]);

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

  // Restore signer in the background. CRITICAL: the signer doesn't need any
  // relays to attach; treat signer attachment as independent from relay pool
  // setup. We flip `ndkReady` based on the signer path so the DM UI unblocks
  // as soon as the signer is ready.
  useEffect(() => {
    if (!sessionChecked) return;

    const loginMethod = useAuthStore.getState().loginMethod;

    let cancelled = false;

    void (async () => {
      if (loginMethod === 'extension' && typeof window !== 'undefined') {
        // NIP-07 extensions inject `window.nostr` asynchronously. Alby and
        // nos2x usually inject within 100–500ms; Amber Bridge and mobile
        // proxy wrappers can take >5s. Tight 100ms poll for the first 3s
        // (fast happy path), then drop to 1s poll for up to 60s. Re-check
        // on visibility change so a backgrounded tab catches up immediately.
        const attachIfReady = (): boolean => {
          if (signerRef.current) return true;
          if (typeof window === 'undefined' || !window.nostr) return false;
          void import('@nostr-wot/signers').then(({ Nip07Signer }) => {
            if (!signerRef.current && window.nostr) {
              login(new Nip07Signer());
            }
          });
          return true;
        };

        for (let i = 0; i < 30 && !signerRef.current && !cancelled; i++) {
          if (attachIfReady()) break;
          await new Promise((r) => setTimeout(r, 100));
        }

        if (!signerRef.current && !cancelled && typeof window !== 'undefined') {
          let slowPollHandle: ReturnType<typeof setInterval> | null = null;
          const stopSlowPoll = () => {
            if (slowPollHandle) { clearInterval(slowPollHandle); slowPollHandle = null; }
            window.removeEventListener('visibilitychange', onVisibility);
          };
          const onVisibility = () => {
            if (document.visibilityState === 'visible') attachIfReady();
          };
          slowPollHandle = setInterval(() => {
            if (signerRef.current) { stopSlowPoll(); return; }
            attachIfReady();
          }, 1000);
          window.addEventListener('visibilitychange', onVisibility);
          setTimeout(stopSlowPoll, 60_000);
        }
      }

      // nsec / bunker / NostrConnect: rebuild the signer from the payload
      // stashed in localStorage at login. Without this the signer dies on
      // every reload (or mobile background eviction) and the user gets
      // silently logged out.
      if (!signerRef.current && (loginMethod === 'nsec' || loginMethod === 'bunker')) {
        const restoredSigner = await restoreRemoteSigner();
        if (restoredSigner) {
          login(restoredSigner);
        } else if (!cancelled) {
          console.warn(`[chat] ${loginMethod} signer restore failed`);
          if (loginMethod === 'nsec') {
            logout();
            setSessionChecked(false);
            setSessionInvalid(true);
            return;
          }
        }
      }
      if (!cancelled) setNdkReady(true);
    })();

    return () => { cancelled = true; };
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
