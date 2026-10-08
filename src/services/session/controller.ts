import type { BridgeImpl } from '@/services/nostr-bridge';
import { STORAGE_KEY, LEGACY_STORAGE_KEY } from '@/constants/nostr-bridge/session';
import { EMPTY_SESSION } from '@/constants/session/session';
import type { NipSigner } from '@/types/nostr/nip-signer';
import type { SessionController, SessionSnapshot } from '@/types/session/session';
import { createSessionActions } from './actions';

function hasStoredSession(): boolean {
  try {
    return typeof window !== 'undefined' && !!(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY));
  } catch {
    return false;
  }
}

/** One subscription per session field and one for the current profile, independent of consumer count. */
export function createSessionController(bridge: BridgeImpl | null, ready: boolean): SessionController {
  let snapshot: SessionSnapshot = { ...EMPTY_SESSION, ready };
  const listeners = new Set<() => void>();
  let profileUnsubscribe: (() => void) | undefined;
  let active = false;
  let profileKey: string | null = null;
  let profileEpoch = 0;
  let mountEpoch = 0;
  const actions = createSessionActions(bridge);
  let signerKey = '';
  let signer: NipSigner | null = null;

  const patch = (next: Partial<SessionSnapshot>) => {
    const candidate = { ...snapshot, ...next };
    candidate.signerReady = candidate.isLoggedIn && candidate.loginMethod !== null
      && (candidate.loginMethod !== 'bunker' || candidate.bunkerSignerReady);
    if (candidate.isLoggedIn) candidate.isRehydrating = false;
    if ((Object.keys(candidate) as Array<keyof SessionSnapshot>).every((key) => Object.is(candidate[key], snapshot[key]))) return;
    snapshot = candidate;
    listeners.forEach((listener) => listener());
  };

  const watchProfile = (pubkey: string | null) => {
    if (profileKey === pubkey) return;
    profileUnsubscribe?.();
    profileUnsubscribe = undefined;
    profileKey = pubkey;
    const epoch = ++profileEpoch;
    // Clear the outgoing user's profile before a new subscription can replay.
    patch({ pubkey, profile: null });
    if (pubkey && bridge) {
      profileUnsubscribe = bridge.subscribeUserMetadata(pubkey, (profile) => {
        if (active && epoch === profileEpoch && profileKey === pubkey) patch({ profile });
      });
    }
  };

  return {
    actions,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    getSigner() {
      const key = `${snapshot.generation}:${snapshot.pubkey}:${snapshot.loginMethod}:${snapshot.signerReady}`;
      if (key !== signerKey) {
        signerKey = key;
        signer = snapshot.pubkey && snapshot.signerReady ? bridge?.getNipSigner() ?? null : null;
      }
      return signer;
    },
    start() {
      active = true;
      const epoch = ++mountEpoch;
      patch({ isRehydrating: !ready && hasStoredSession() });
      const unsubs = bridge ? [
        bridge.subscribeSessionGeneration((generation) => { if (active && epoch === mountEpoch) patch({ generation }); }),
        bridge.subscribeIsRestoringSession((isRehydrating) => { if (active && epoch === mountEpoch) patch({ isRehydrating }); }),
        bridge.subscribeIsLoggedIn((isLoggedIn) => { if (active && epoch === mountEpoch) patch({ isLoggedIn }); }),
        bridge.subscribeMyLoginMethod((loginMethod) => { if (active && epoch === mountEpoch) patch({ loginMethod }); }),
        bridge.subscribeBunkerSignerReady((bunkerSignerReady) => { if (active && epoch === mountEpoch) patch({ bunkerSignerReady }); }),
        bridge.subscribeSessionNotice((notice) => { if (active && epoch === mountEpoch) patch({ notice }); }),
        bridge.subscribeMyPubkey((pubkey) => { if (active && epoch === mountEpoch) watchProfile(pubkey); }),
      ] : [];
      return () => {
        active = false;
        ++profileEpoch;
        ++mountEpoch;
        unsubs.forEach((unsubscribe) => unsubscribe());
        profileUnsubscribe?.();
        profileUnsubscribe = undefined;
        profileKey = null;
      };
    },
  };
}
