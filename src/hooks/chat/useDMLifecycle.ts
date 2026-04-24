'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { discoverDMThreads, subscribeDMs, computeUnreadCounts } from '@/lib/dm';
import type { DMMessage } from '@/lib/dm';
import { publishInboxRelays } from '@/lib/dm-inbox';
import { addDMInboxRelays, formatPubkey, getNDK } from '@/lib/nostr';
import { DM_FEATURE_ENABLED } from '@/lib/feature-flags';
import { handleIncomingDM } from '@/lib/read-gates';

type Args = {
  isDMMode: boolean;
  ndkReady: boolean;
  profilePubkey: string | undefined;
  profileCache: Map<string, { name?: string; picture?: string }>;
};

/**
 * Everything DM-lifecycle: lazy NIP-17 discovery, polling loop, inbox-relay
 * publish, the DM subscription, and the guard-reset on account switch.
 *
 * Returns `runDMDiscovery` so the sidebar refresh button can force a re-sync.
 */
export function useDMLifecycle({ isDMMode, ndkReady, profilePubkey, profileCache }: Args) {
  // Discover DM threads lazily: we only hit relays (and publish our NIP-17
  // inbox relay list) the first time the user enters DM mode, not on chat
  // page mount. Fetching on every chat load would burn signer popups for
  // users who never open DMs during a session. The ref makes repeated
  // sidebar toggles a no-op; the refresh button in DMList calls the helper
  // below directly to force a re-sync.
  const dmDiscoveryRanRef = useRef(false);

  const runDMDiscovery = useCallback(
    async (force = false) => {
      if (!profilePubkey) return;
      const myPubkey = profilePubkey;

      useDMStore.getState().setLoadingThreads(true);

      const threadsFromMap = (threadMap: Map<string, { lastMessage: string; lastMessageAt: number; protocol: 'nip04' | 'nip17' }>) =>
        Array.from(threadMap.entries())
          .sort((a, b) => b[1].lastMessageAt - a[1].lastMessageAt)
          .map(([pubkey, info]) => {
            const cached = profileCache.get(pubkey);
            const existing = useDMStore.getState().threads.find((t) => t.pubkey === pubkey);
            return {
              pubkey,
              displayName: cached?.name || formatPubkey(pubkey),
              picture: cached?.picture,
              lastMessage: info.lastMessage,
              lastMessageAt: info.lastMessageAt,
              unreadCount: existing?.unreadCount ?? 0,
              protocol: info.protocol,
            };
          });

      const recomputeUnreads = () => {
        const { readCursors } = useDMStore.getState();
        const counts = computeUnreadCounts(myPubkey, readCursors);
        useNotificationStore.getState().setDMUnreads(counts);
        const currentThreads = useDMStore.getState().threads;
        useDMStore.getState().setThreads(
          currentThreads.map((t) => ({ ...t, unreadCount: counts[t.pubkey] ?? 0 })),
        );
      };

      try {
        // Phase A returns immediately from the localStorage cache.
        const cachedMap = await discoverDMThreads(myPubkey, {
          forceFullScan: force,
          onUpdate: (updatedMap) => {
            // Phase B (relay sync) finished — re-render with fresh data and
            // flip the spinner off once we have real data.
            useDMStore.getState().setThreads(threadsFromMap(updatedMap));
            useDMStore.getState().setLoadingThreads(false);
            recomputeUnreads();
          },
        });

        const hasCache = cachedMap.size > 0;
        useDMStore.getState().setThreads(threadsFromMap(cachedMap));
        // If Phase A was empty, keep the spinner on — Phase B will clear it
        // via onUpdate once relays respond. Otherwise show the cached view now.
        if (hasCache) {
          useDMStore.getState().setLoadingThreads(false);
          recomputeUnreads();
        }

        // Publish inbox relays lazily, same gate as discovery.
        void publishInboxRelays(myPubkey);
      } catch {
        useDMStore.getState().setLoadingThreads(false);
      }
    },
    [profilePubkey, profileCache],
  );

  // Trigger the first discovery pass the moment the user enters DM mode,
  // then keep re-polling every DM_POLL_INTERVAL_MS while the user stays in
  // the DM view so new messages trickle in without a manual refresh.
  // On toggle-off the interval is torn down — we don't want to hold a
  // DM subscription open while the user is in a regular channel.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    console.log('[dm] effect fired', {
      isDMMode,
      ndkReady,
      pubkey: profilePubkey,
      signer: !!getNDK().signer,
      alreadyRan: dmDiscoveryRanRef.current,
    });
    if (!isDMMode || !ndkReady || !profilePubkey) return;

    const myPubkey = profilePubkey;

    // First-time gate: on initial entry, also register NIP-17 inbox relays
    // (and resolve user's kind 10050 list). This opens AUTH-required relays
    // via the policy set in getNDK(). Subsequent entries skip this work.
    if (!dmDiscoveryRanRef.current) {
      dmDiscoveryRanRef.current = true;
      void addDMInboxRelays(myPubkey).then(() => runDMDiscovery());
    } else {
      void runDMDiscovery();
    }

    const DM_POLL_INTERVAL_MS = 60_000;
    const interval = setInterval(() => {
      // Incremental poll — the sync state inside discoverDMThreads already
      // narrows the filter to `since = lastPollAt`, so this is cheap.
      void runDMDiscovery();
    }, DM_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isDMMode, ndkReady, profilePubkey, runDMDiscovery]);

  // Reset the guard whenever the user logs out / switches accounts so the
  // next login re-runs discovery for the new pubkey.
  useEffect(() => {
    dmDiscoveryRanRef.current = false;
  }, [profilePubkey]);

  // Subscribe to incoming DMs (NIP-04 + NIP-17). Gated on isDMMode so we
  // don't open a history-replaying subscription (NDK fetches until EOSE
  // before streaming) on every chat page load — the user explicitly wants
  // DM traffic to happen only when they're in the DM view. Notifications
  // while browsing channels are intentionally deferred until they switch.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    if (!isDMMode || !ndkReady || !profilePubkey) return;

    const cleanup = subscribeDMs(profilePubkey, (msg: DMMessage) => {
      const dmStore = useDMStore.getState();
      const otherPubkey = msg.senderPubkey === profilePubkey
        ? msg.recipientPubkey
        : msg.senderPubkey;
      const isOwnMessage = msg.senderPubkey === profilePubkey;

      // Never increment unread for your own outgoing messages, and never
      // auto-clear on incoming — useReadTracker decides that based on
      // visibility + focus. `handleIncomingDM` also mirrors the count into
      // the notification store so the favicon badge reflects DMs.
      const existingThread = dmStore.threads.find(t => t.pubkey === otherPubkey);
      const currentUnread = existingThread?.unreadCount ?? 0;
      const { nextUnread } = handleIncomingDM(otherPubkey, isOwnMessage, currentUnread);
      if (existingThread) {
        dmStore.updateThread(otherPubkey, {
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: nextUnread,
        });
      } else {
        const cached = profileCache.get(otherPubkey);
        dmStore.addThread({
          pubkey: otherPubkey,
          displayName: cached?.name || formatPubkey(otherPubkey),
          picture: cached?.picture,
          lastMessage: msg.content,
          lastMessageAt: msg.createdAt,
          unreadCount: nextUnread,
        });
      }

      // Add to active conversation if viewing this thread
      if (dmStore.activeDMPubkey === otherPubkey) {
        // Avoid duplicates
        const exists = dmStore.messages.some(m => m.id === msg.id);
        if (!exists) {
          dmStore.addMessage(msg);
        }
      }
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [isDMMode, ndkReady, profilePubkey, profileCache]);

  return { runDMDiscovery };
}
