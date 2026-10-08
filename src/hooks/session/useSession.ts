'use client';

import { useCallback, useContext, useSyncExternalStore } from 'react';
import { SessionContext } from '@/contexts/session/session';
import { EMPTY_SESSION } from '@/constants/session/session';
import type { SessionSnapshot } from '@/types/session/session';

const noopSubscribe = () => () => {};
const noSigner = () => null;

/** Select a stable field/reference; React only rerenders when the selected result changes. */
export function useSessionSelector<T>(select: (snapshot: SessionSnapshot) => T): T {
  const controller = useContext(SessionContext);
  const getSnapshot = useCallback(() => select(controller?.getSnapshot() ?? EMPTY_SESSION), [controller, select]);
  const getServerSnapshot = useCallback(() => select(EMPTY_SESSION), [select]);
  return useSyncExternalStore(controller?.subscribe ?? noopSubscribe, getSnapshot, getServerSnapshot);
}

/** Use the whole snapshot only on surfaces that need all session/profile fields. */
export function useSession() { return useSessionSelector((state) => state); }
export function useIsLoggedIn() { return useSessionSelector((state) => state.isLoggedIn); }
export function useIsRehydrating() { return useSessionSelector((state) => state.isRehydrating); }
export function useMyPubkey() { return useSessionSelector((state) => state.pubkey); }
export function useMyLoginMethod() { return useSessionSelector((state) => state.loginMethod); }
export function useBunkerSignerReady() { return useSessionSelector((state) => state.bunkerSignerReady); }
export function useSignerReady() { return useSessionSelector((state) => state.signerReady); }
export function useSessionNotice() { return useSessionSelector((state) => state.notice); }
export function useSessionProfile() { return useSessionSelector((state) => state.profile); }
export function useSessionGeneration() { return useSessionSelector((state) => state.generation); }
export function useSessionReady() { return useSessionSelector((state) => state.ready); }

/** The signer stays private to the bridge; the hook exposes its existing signing adapter only when ready. */
export function useNipSigner() {
  const controller = useContext(SessionContext);
  return useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getSigner ?? noSigner, noSigner);
}

/** Stable commands: subscribing to actions never subscribes to profile or identity changes. */
export function useSessionActions() {
  const controller = useContext(SessionContext);
  if (!controller) throw new Error('Session actions require SessionProvider');
  return controller.actions;
}
