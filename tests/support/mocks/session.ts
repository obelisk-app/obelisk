import type { SessionSnapshot, SessionActions } from '@/types/session/session';

type SessionHooks = typeof import('@/hooks/session/useSession');

const PUBKEY = 'f'.repeat(64);
const snapshot: SessionSnapshot = Object.freeze({
  ready: true, generation: 0, isLoggedIn: true, isRehydrating: false,
  pubkey: PUBKEY, loginMethod: 'nsec', bunkerSignerReady: false,
  signerReady: true, notice: null, profile: null,
});

const missingAction = async (): Promise<never> => { throw new Error('Wire the session action used by this test'); };
const actions: SessionActions = {
  login: missingAction, logout: missingAction, updateProfile: missingAction,
  publishGeneratedProfile: missingAction,
};

/** Independent hook mock: never loads the bridge, provider or real session hook graph. */
export function sessionMock(overrides: Partial<SessionHooks> = {}): SessionHooks {
  return {
    useSession: () => snapshot,
    useSessionSelector: (select) => select(snapshot),
    useIsLoggedIn: () => true,
    useIsRehydrating: () => false,
    useMyPubkey: () => PUBKEY,
    useMyLoginMethod: () => 'nsec',
    useBunkerSignerReady: () => false,
    useSignerReady: () => true,
    useSessionNotice: () => null,
    useSessionProfile: () => null,
    useSessionGeneration: () => 0,
    useSessionReady: () => true,
    useNipSigner: () => null,
    useSessionActions: () => actions,
    ...overrides,
  };
}
