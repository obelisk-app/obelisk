import { getBridgeImpl } from '@/services/nostr-bridge';

/** Capture the public session owner for non-React services; credentials stay on the bridge. */
export function captureActiveSession(account?: string | null) {
  const bridge = getBridgeImpl();
  const pubkey = bridge?.myPubkey.get();
  const loginMethod = bridge?.myLoginMethod.get();
  if (!bridge || !bridge.isLoggedIn.get() || !pubkey || !loginMethod) return null;
  if (account !== undefined && account !== pubkey) return null;
  const generation = bridge.getSessionGeneration();
  const assertOwner = bridge.captureSessionGuard();
  const isCurrent = () => {
    try { assertOwner(); } catch { return false; }
    return getBridgeImpl() === bridge && bridge.isLoggedIn.get()
      && bridge.getSessionGeneration() === generation && bridge.myPubkey.get() === pubkey
      && bridge.myLoginMethod.get() === loginMethod;
  };
  if (!isCurrent()) return null;
  return {
    pubkey,
    loginMethod,
    isCurrent,
    assertCurrent() {
      assertOwner();
      if (!isCurrent()) throw new DOMException('Session was replaced', 'AbortError');
    },
  };
}
