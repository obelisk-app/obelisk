import { useChatStore } from '@/store/chat';
import { useReadStateStore } from '@/store/read-state';
import { useVoiceStore } from '@/store/voice';
import { _resetCacheKeyState } from '@/lib/dm/cache-key';

// Clears all per-identity client state. Called from `BridgeImpl.logout()`
// so the next user never sees the previous account's servers, channels,
// messages, read cursors, or an already-joined voice channel.
//
// Browser-level things that are *not* identity-scoped (e.g. the Notification
// permission flag) are preserved by the individual store resets.
export function resetAllClientState(): void {
  useChatStore.getState().reset();
  useReadStateStore.getState().reset();
  useVoiceStore.getState().leaveVoice();

  // DM cache-key (KEK in-memory key map). Persisted localStorage blobs are
  // per-pubkey-keyed already and survive — the next session reads them back.
  // We only zero out cross-identity in-memory leakage here.
  _resetCacheKeyState();

  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('obelisk-auth-in-progress');
    localStorage.removeItem('obelisk:followed-migrated');
    localStorage.removeItem('obelisk:followed-posts');
    // Wipe per-channel lastSeen anchors so the next account on this browser
    // doesn't inherit the previous user's reading position. Includes both
    // legacy unscoped keys and the pubkey-scoped variant.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('chat:lastSeen:')) localStorage.removeItem(k);
    }
  } catch {
    // localStorage can throw in private-browsing / quota edge cases —
    // ignore, the in-memory reset above is the real guarantee.
  }
}
