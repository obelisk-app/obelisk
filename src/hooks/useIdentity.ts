/**
 * Single React-side surface for identity state. Consumers should prefer
 * this over reading individual auth-store fields, so when we eventually
 * lift the underlying state into a dedicated identity store the swap
 * happens here only.
 *
 * Non-React callers (`dm/dm.ts`, `nostr-read.ts`, `nostr.ts` login flows)
 * keep using `useAuthStore.getState()` for now — that's the same store
 * this hook reads from.
 */

'use client';

import { useAuthStore } from '@/store/auth';
import type { LoginMethod, NostrProfile } from '@/lib/nostr';

export interface IdentitySnapshot {
  /** Backend-cookie-validated pubkey, or null if unauthenticated. */
  pubkey: string | null;
  /** Cached profile (display name, avatar, etc.). null until restoreSession. */
  profile: NostrProfile | null;
  /** Login method used for this session — drives signer-restore branch. */
  loginMethod: LoginMethod | null;
  /** Backend session is valid. */
  isConnected: boolean;
  /** NDK signer is live and can encrypt/sign/publish. Reactive. */
  signerReady: boolean;
  /** Auth store has finished its persist-rehydration cycle. */
  hydrated: boolean;
}

export function useIdentity(): IdentitySnapshot {
  // Each `useAuthStore(selector)` call subscribes to that one slice — React
  // re-renders the consumer only when the selected value changes.
  const profile = useAuthStore((s) => s.profile);
  const loginMethod = useAuthStore((s) => s.loginMethod);
  const isConnected = useAuthStore((s) => s.isConnected);
  const signerReady = useAuthStore((s) => s.signerReady);
  const hydrated = useAuthStore((s) => s._hasHydrated);

  return {
    pubkey: profile?.pubkey ?? null,
    profile,
    loginMethod,
    isConnected,
    signerReady,
    hydrated,
  };
}
