/**
 * Centralized identity orchestration.
 *
 * Owns the mount-time lifecycle that was previously scattered across:
 *   - `useSessionBootstrap` (chat-only): session validate + signer restore
 *   - `Navbar`: session validate fallback
 *   - `nostr.ts` login flows: side-effect mutation of `ndk.signer`
 *   - `useAuthStore.logout`: signer clear
 *
 * The provider wraps any subtree that needs identity (`/chat`, `/admin`,
 * `/moderation`, `/invite`). Inside it:
 *   - `restoreSession()` validates the backend session cookie.
 *   - If valid, `restoreRemoteSigner()` rebuilds the in-memory NDK signer
 *     from the persisted payload (nsec / bunker), or wires NIP-07 if the
 *     extension is available.
 *   - `signerReady` flips to `true` once the signer is live.
 *
 * Components consume via `useIdentity()` (see `src/hooks/useIdentity.ts`)
 * and gate UI on the reactive `signerReady` flag — never on a raw
 * `getNDK().signer` read at render time.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getNDK, connectNDK, restoreRemoteSigner } from '@/lib/nostr';

interface IdentityProviderProps {
  /** If true, `IdentityProvider` redirects via `onSessionInvalid` when the
   *  backend cookie is missing/expired. Pages that should show themselves
   *  even unauthenticated (landing, invite preview) should pass false. */
  requireSession?: boolean;
  /** Called once when the provider has confirmed the session is invalid.
   *  Typically used to bounce to `/`. */
  onSessionInvalid?: () => void;
  children: React.ReactNode;
}

export function IdentityProvider({ requireSession = true, onSessionInvalid, children }: IdentityProviderProps) {
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const setSignerReady = useAuthStore((s) => s.setSignerReady);
  const profilePubkey = useAuthStore((s) => s.profile?.pubkey ?? null);
  const sessionStarted = useRef(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Validate the backend session once. The auth store's restoreSession
  // resolves true/false based on whether the cookie produced a valid
  // identity. We mirror that into a hook-local `sessionChecked` so the
  // signer-restore effect can sequence on it.
  useEffect(() => {
    if (sessionStarted.current) return;
    sessionStarted.current = true;
    restoreSession().then((valid) => {
      setSessionChecked(true);
      if (!valid && requireSession) onSessionInvalid?.();
    });
  }, [restoreSession, requireSession, onSessionInvalid]);

  // Once the session is valid, restore the NDK signer. Idempotent: if
  // the signer is already set (fresh login flow), this is a no-op.
  useEffect(() => {
    if (!sessionChecked || !profilePubkey) return;
    const loginMethod = useAuthStore.getState().loginMethod;
    const ndk = getNDK();
    let cancelled = false;

    void connectNDK()
      .then(async () => {
        if (cancelled) return;
        if (!ndk.signer && loginMethod === 'extension' && typeof window !== 'undefined' && window.nostr) {
          const { NDKNip07Signer } = await import('@nostr-dev-kit/ndk');
          ndk.signer = new NDKNip07Signer(4000, ndk);
        }
        if (!ndk.signer && (loginMethod === 'nsec' || loginMethod === 'bunker')) {
          const ok = await restoreRemoteSigner();
          if (!ok) {
            console.warn(`[identity] ${loginMethod} signer restore failed`);
            if (loginMethod === 'nsec') {
              // nsec is supposed to work synchronously every time. If it
              // doesn't, the persisted payload is corrupt — log out so the
              // user lands somewhere coherent.
              useAuthStore.getState().logout();
              return;
            }
          }
        }
        if (!cancelled) setSignerReady(Boolean(ndk.signer));
      })
      .catch((err) => {
        console.warn('[identity] NDK connect failed:', err);
        if (!cancelled) setSignerReady(Boolean(ndk.signer));
      });

    return () => { cancelled = true; };
  }, [sessionChecked, profilePubkey, setSignerReady]);

  return <>{children}</>;
}
