import { useChatStore } from '@/store/chat';
import { useReadStateStore } from '@/store/read-state';
import { useNotificationsStore } from '@/store/notifications';
import { useVoiceStore } from "@/store/voice";
import { useDMStore } from "@/store/dm";
import { useGamesStore } from "@/store/games";
import { resetGameIngest } from "@/lib/games/ingest";
import { __resetGameResolver } from "@/lib/games/resolve";

// Clears all per-identity client state. Called from `BridgeImpl.logout()`
// so the next user never sees the previous account's servers, channels,
// messages, read cursors, or an already-joined voice channel.
//
// Browser-level things that are *not* identity-scoped (e.g. the Notification
// permission flag) are preserved by the individual store resets.
export function resetAllClientState(): void {
  useChatStore.getState().reset();
  useReadStateStore.getState().reset();
  useNotificationsStore.getState().reset();
  useVoiceStore.getState().leaveVoice();
  // Tables are relay state, but which tables you can see depends on which
  // relay you are authenticated against — so they don't survive a switch.
  // Drop the pending ingest batch first, or it lands after the reset.
  resetGameIngest();
  __resetGameResolver();
  useGamesStore.getState().reset();
  useDMStore.setState({
    isDMMode: false,
    activeDMPubkey: null,
    threads: [],
    messages: [],
    isLoadingMessages: false,
    isLoadingThreads: false,
    hasMoreHistory: false,
    showProtocolPrompt: null,
  });

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
