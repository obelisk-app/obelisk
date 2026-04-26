'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { publishInboxRelays } from '@/lib/dm/dm-inbox';
import { getCachedEvents } from '@/lib/dm/dm-cache';
import { formatPubkey, getNDK } from '@/lib/nostr';
import { DM_FEATURE_ENABLED } from '@/lib/feature-flags';

type Args = {
  isDMMode: boolean;
  ndkReady: boolean;
  profilePubkey: string | undefined;
  profileCache: Map<string, { name?: string; picture?: string }>;
};

const KIND_NIP04 = 4;

interface PartnerInfo {
  lastMessageAt: number;
  /** Best-effort protocol marker: only NIP-04 events let us know the partner
   *  without a signer-decrypt, so any partner derived here has at least one
   *  NIP-04 event. NIP-17-only threads appear once DMChat decrypts a wrap. */
  protocol: 'nip04';
}

/**
 * Walk the encrypted-at-rest DM cache and project it down to
 * partner → latest-event metadata. Only NIP-04 events expose the partner in
 * cleartext (via the `p` tag / event author); NIP-17 wraps require a
 * signer-decrypt to know who the partner is, so we leave those for DMChat
 * to surface lazily through the secrets-cache path.
 */
function enumerateNip04Partners(myPubkey: string): Map<string, PartnerInfo> {
  const partners = new Map<string, PartnerInfo>();
  for (const ev of getCachedEvents(myPubkey)) {
    if (ev.kind !== KIND_NIP04) continue;
    let partner = '';
    if (ev.pubkey === myPubkey) {
      partner = ev.tags.find((t) => t[0] === 'p')?.[1] ?? '';
    } else {
      partner = ev.pubkey;
    }
    if (!partner || partner === myPubkey) continue;
    const existing = partners.get(partner);
    if (!existing || ev.created_at > existing.lastMessageAt) {
      partners.set(partner, { lastMessageAt: ev.created_at, protocol: 'nip04' });
    }
  }
  return partners;
}

/**
 * Compute per-partner unread counts using local read cursors. Only NIP-04
 * events count today (NIP-17 contributes once DMChat has decrypted them
 * into the messages store, which it routes via handleIncomingDM separately).
 */
function computeUnreadCountsFromCache(
  myPubkey: string,
  readCursors: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ev of getCachedEvents(myPubkey)) {
    if (ev.kind !== KIND_NIP04) continue;
    if (ev.pubkey === myPubkey) continue; // outgoing
    const partner = ev.pubkey;
    const cutoffMs = readCursors[partner] ?? 0;
    if (ev.created_at * 1000 <= cutoffMs) continue;
    out[partner] = (out[partner] ?? 0) + 1;
  }
  return out;
}

/**
 * DM lifecycle hook for the chat page. Coordinates the side-effects that
 * the DMSessionProvider doesn't already handle:
 *  - publishing the user's NIP-17 inbox relay list (kind 10050) on first
 *    DM-mode entry (so other clients can route gift-wraps to us),
 *  - polling the encrypted-at-rest cache to derive a thread list and unread
 *    counts for the sidebar.
 *
 * `DMSessionProvider` (mounted on the chat page's DM-tab subtree) drives the
 * actual wire-level subscription via `subscribeLive`, which writes events
 * into `dm-cache`. This hook just projects that cache state into the UI's
 * Zustand store. Decryption (and NIP-17 partner discovery) lives in DMChat,
 * which decrypts on viewport and stashes plaintext envelopes in the secrets
 * cache; the threads list backfills as users open conversations.
 */
export function useDMLifecycle({ isDMMode, ndkReady, profilePubkey, profileCache }: Args) {
  // Guard rail: only publish the inbox relay list once per DM-mode entry per
  // session. Cleared whenever the active pubkey changes (login switch).
  const inboxPublishedRef = useRef(false);

  const refreshThreads = useCallback(() => {
    if (!profilePubkey) return;
    const myPubkey = profilePubkey;
    const partners = enumerateNip04Partners(myPubkey);
    const dmStore = useDMStore.getState();

    // Merge with existing threads so NIP-17-only threads (added by DMChat
    // via addThread / updateThread on decrypt) survive the projection.
    const existingByPubkey = new Map(dmStore.threads.map((t) => [t.pubkey, t]));
    for (const [partner, info] of partners) {
      const existing = existingByPubkey.get(partner);
      const cached = profileCache.get(partner);
      existingByPubkey.set(partner, {
        pubkey: partner,
        displayName: existing?.displayName || cached?.name || formatPubkey(partner),
        picture: existing?.picture || cached?.picture,
        lastMessage: existing?.lastMessage ?? '',
        // Take the newer of the two — the live store may have a fresher
        // timestamp from the most recent decrypt.
        lastMessageAt: Math.max(existing?.lastMessageAt ?? 0, info.lastMessageAt),
        unreadCount: existing?.unreadCount ?? 0,
        protocol: existing?.protocol ?? info.protocol,
      });
    }

    const merged = Array.from(existingByPubkey.values()).sort(
      (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0),
    );

    // Recompute unread counts: NIP-04 from cache, NIP-17 preserved from the
    // existing thread state (set by DMChat / handleIncomingDM).
    const nip04Unreads = computeUnreadCountsFromCache(myPubkey, dmStore.readCursors);
    const finalThreads = merged.map((t) => ({
      ...t,
      unreadCount: nip04Unreads[t.pubkey] ?? t.unreadCount ?? 0,
    }));

    const totalUnreads: Record<string, number> = {};
    for (const t of finalThreads) {
      if (t.unreadCount > 0) totalUnreads[t.pubkey] = t.unreadCount;
    }

    dmStore.setThreads(finalThreads);
    dmStore.setLoadingThreads(false);
    useNotificationStore.getState().setDMUnreads(totalUnreads);
  }, [profilePubkey, profileCache]);

  // Publish the kind 10050 inbox relay list lazily, the first time the user
  // enters DM mode with a signer attached. Other Nostr clients use this
  // event to learn which relays to send gift-wrapped DMs to.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    if (!isDMMode || !ndkReady || !profilePubkey) return;
    if (inboxPublishedRef.current) return;
    if (!getNDK().signer) return;
    inboxPublishedRef.current = true;
    void publishInboxRelays(profilePubkey);
  }, [isDMMode, ndkReady, profilePubkey]);

  // Reset the inbox-publish guard whenever the active account changes.
  useEffect(() => {
    inboxPublishedRef.current = false;
  }, [profilePubkey]);

  // Project the cache into the threads list. Run on entry, then poll every
  // 5s while the user is in DM mode so freshly-cached events from the live
  // subscription (in DMSessionProvider) surface in the sidebar. The poll is
  // a cheap in-memory walk — no relay traffic — so a tight cadence is fine.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    if (!isDMMode || !ndkReady || !profilePubkey) return;

    useDMStore.getState().setLoadingThreads(true);
    refreshThreads();

    const interval = setInterval(refreshThreads, 5000);
    return () => clearInterval(interval);
  }, [isDMMode, ndkReady, profilePubkey, refreshThreads]);

  return { runDMDiscovery: refreshThreads };
}
