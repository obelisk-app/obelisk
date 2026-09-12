import { useChatStore } from '@/store/chat';
import { useReadStateStore } from '@/store/read-state';
import { useNotificationsStore } from '@/store/notifications';
import { useVoiceStore } from "@/store/voice";
import { useDMStore } from "@/store/dm";

/**
 * Teardown for subsystems this module must NOT import.
 *
 * `client.ts` imports this file, so anything imported here is on the login
 * path. Reaching for the games store directly put `session.ts -> registry.ts`
 * and all three game engines (including the `vesta` package) into the login
 * chunk, and made a cycle out of `client.ts -> reset.ts -> games/resolve.ts ->
 * client.ts`. Registering instead inverts it: a subsystem that has been loaded
 * hooks itself up, and one that hasn't has no state to clear in the first
 * place.
 */
const resetHooks = new Set<() => void>();

export function registerClientResetHook(fn: () => void): () => void {
  resetHooks.add(fn);
  return () => resetHooks.delete(fn);
}

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
  for (const hook of resetHooks) {
    // One subsystem failing to tear down must not strand the rest — the next
    // account would inherit whatever came after it in the list.
    try { hook(); } catch (err) { console.warn('[reset] teardown hook failed', err); }
  }
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
