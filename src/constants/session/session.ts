import type { SessionSnapshot } from '@/types/session/session';

/** Stable server/outside-provider snapshot for hydration and selector hooks. */
export const EMPTY_SESSION: SessionSnapshot = Object.freeze({
  generation: 0,
  ready: false,
  isLoggedIn: false,
  isRehydrating: false,
  pubkey: null,
  loginMethod: null,
  bunkerSignerReady: false,
  extensionIdentityPending: false,
  signerReady: false,
  notice: null,
  profile: null,
});
