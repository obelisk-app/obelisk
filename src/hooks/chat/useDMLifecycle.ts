'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';
import { publishInboxRelays } from '@/lib/dm/dm-inbox';
import { getCachedEvents, subscribeToCacheTick } from '@/lib/dm/dm-cache';
import { setProfileDynamicRelays } from '@/lib/dm/profile-cache';
import { loadInboxWindow, fetchMyInboxRelays, fetchMyDmRelays } from '@/lib/dm/dm';
import { formatPubkey, getExplicitRelays } from '@/lib/nostr';
import { DM_FEATURE_ENABLED } from '@/lib/feature-flags';
import { useSigner } from '@nostr-wot/data/react';
import type { NostrSigner } from '@nostr-wot/signers';

type Args = {
  isDMMode: boolean;
  ndkReady: boolean;
  profilePubkey: string | undefined;
  profileCache: Map<string, { name?: string; picture?: string }>;
};

const KIND_NIP04 = 4;

/**
 * Ask the NIP-07 extension for the user's configured read/write relays.
 *
 * `window.nostr.getRelays()` is the most reliable source — it doesn't require
 * us to find the user's kind 10002/10050 events on any specific relay (which
 * is fragile: the events live wherever the user's *other* client published
 * them, and we may not have any of those relays in our search net). The
 * extension always knows the canonical list because the user typed it in.
 *
 * Returns the deduped union of `read` + `write` relays. Empty if no
 * extension, the extension doesn't implement `getRelays`, or the call
 * throws (some bunker proxies advertise the method but reject it).
 */
async function getRelaysFromExtension(): Promise<string[]> {
  if (typeof window === 'undefined') return [];
  const nostr = (window as unknown as {
    nostr?: { getRelays?: () => Promise<Record<string, { read?: boolean; write?: boolean }>> };
  }).nostr;
  if (!nostr?.getRelays) return [];
  try {
    const map = await nostr.getRelays();
    if (!map || typeof map !== 'object') return [];
    return Array.from(new Set(
      Object.keys(map).filter(
        (url) => typeof url === 'string' && url.startsWith('wss://') && !url.includes('localhost') && !url.includes('127.0.0.1'),
      ),
    ));
  } catch (err) {
    console.warn('[dm-walker] getRelaysFromExtension failed:', err);
    return [];
  }
}

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
  // Guard the historical inbox walker: run once per session per pubkey.
  const inboxWalkedRef = useRef<string | null>(null);
  const signer = useSigner() as unknown as NostrSigner | null;

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

    // For partners we don't share a server with, displayName is the npub
    // Profile fetches are now driven by `ProfileProvider` — the consumer
    // hooks (`useProfile` in DMThreadRow / DMChat / DMMessageBubble) trigger
    // a single subscription per pubkey across the whole tree. This hook no
    // longer needs to walk threads and fan out kind-0 fetches; the provider
    // does it lazily as components mount.
  }, [profilePubkey, profileCache]);

  // Publish the kind 10050 inbox relay list lazily, the first time the user
  // enters DM mode with a signer attached. Other Nostr clients use this
  // event to learn which relays to send gift-wrapped DMs to.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    if (!isDMMode || !ndkReady || !profilePubkey) return;
    if (inboxPublishedRef.current) return;
    if (!signer) return;
    inboxPublishedRef.current = true;
    void publishInboxRelays(signer, getExplicitRelays());
  }, [isDMMode, ndkReady, profilePubkey, signer]);

  // Reset session guards whenever the active account changes.
  useEffect(() => {
    inboxPublishedRef.current = false;
    inboxWalkedRef.current = null;
  }, [profilePubkey]);

  // Project the cache into the threads list. The first projection runs
  // synchronously off the localStorage-hydrated cache so the sidebar shows
  // the LAST KNOWN state instantly — no skeleton between visits. After
  // that, every cache mutation (live tail, walker windows, loadOlder)
  // fires `subscribeToCacheTick` and we re-project. A short debounce
  // collapses bursts (the inbox walker can ingest hundreds of events in a
  // window) into a single re-render.
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    if (!isDMMode || !ndkReady || !profilePubkey) return;

    // Only show the spinner if there's truly nothing cached. With cache
    // present we paint the cached threads first and update silently.
    const hasCached = getCachedEvents(profilePubkey).length > 0;
    if (!hasCached) useDMStore.getState().setLoadingThreads(true);
    refreshThreads();

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeToCacheTick((pk) => {
      if (pk !== profilePubkey) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(refreshThreads, 200);
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      unsub();
    };
  }, [isDMMode, ndkReady, profilePubkey, refreshThreads]);

  // Historical inbox walker. On first DM-mode entry, fetch the last ~30
  // days. If we still don't have ENOUGH_PARTNERS in the inbox, extend the
  // window backwards another 30 days. Repeat until threshold met OR a
  // window returns no new partners (genesis reached) OR the cap is hit.
  // Runs ONCE per pubkey per session (subsequent entries just live-tail).
  useEffect(() => {
    if (!DM_FEATURE_ENABLED) return;
    if (!isDMMode || !ndkReady || !profilePubkey) return;
    if (inboxWalkedRef.current === profilePubkey) return;
    inboxWalkedRef.current = profilePubkey;

    const ENOUGH_PARTNERS = 20;
    const WINDOW_SEC = 30 * 24 * 60 * 60;
    const MAX_WINDOWS = 12; // ~1 year safety cap

    void (async () => {
      const poolRelays = getExplicitRelays();

      // Build the relay search set from four sources:
      //   1. The NDK pool (relays we're already connected to, including any
      //      auto-discovered via the outbox model).
      //   2. The NIP-07 extension's `getRelays()` if available — this is the
      //      most reliable source because the extension always knows the
      //      user's canonical configured set, regardless of where they
      //      published their kind 10002/10050.
      //   3. A handful of well-known aggregators as a safety net.
      //   4. Whatever kind 10002/10050 we can find across the union of 1-3.
      //
      // Without (2), users whose kind 10002 lives only on their own private
      // relays — never republished to public aggregators — get an empty inbox.
      const aggregators = [
        'wss://purplepag.es',
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://nostr.wine',
      ];
      const extensionRelays = await getRelaysFromExtension();
      const searchRelays = Array.from(new Set([
        ...poolRelays,
        ...extensionRelays,
        ...aggregators,
      ]));
      console.log('[dm-walker] starting', {
        poolRelays: JSON.stringify(poolRelays),
        extensionRelays: JSON.stringify(extensionRelays),
        aggregators: JSON.stringify(aggregators),
        profilePubkey,
      });
      const [inboxRelays, dmRelays] = await Promise.all([
        fetchMyInboxRelays({ myPubkey: profilePubkey, searchRelays }),
        fetchMyDmRelays({ myPubkey: profilePubkey, searchRelays }),
      ]);
      console.log('[dm-walker] fetched relay lists', {
        inboxRelays: JSON.stringify(inboxRelays),
        dmRelays: JSON.stringify(dmRelays),
      });
      const myInboxRelays = Array.from(new Set([
        ...poolRelays,
        ...extensionRelays,
        ...inboxRelays,
        ...dmRelays,
      ]));
      console.log('[dm-walker] merged relay set', { myInboxRelays: JSON.stringify(myInboxRelays) });
      // Hand the same merged set to profile-cache so partner avatar/name
      // lookups ride the user's actual relays, not just purplepag.es. Done
      // before the walker starts so the per-thread profile fetches kicked
      // off by refreshThreads() pick up the wider net immediately.
      setProfileDynamicRelays(myInboxRelays);
      let until = Math.floor(Date.now() / 1000);

      for (let i = 0; i < MAX_WINDOWS; i++) {
        const partnersBefore = enumerateNip04Partners(profilePubkey).size;
        console.log(`[dm-walker] window ${i + 1}/${MAX_WINDOWS}`, { until, partnersBefore });
        await loadInboxWindow({
          myPubkey: profilePubkey,
          myInboxRelays,
          until,
          limit: 200,
        });
        const partnersAfter = enumerateNip04Partners(profilePubkey).size;
        console.log(`[dm-walker] window ${i + 1} done`, { partnersAfter, delta: partnersAfter - partnersBefore });
        // Re-project so the sidebar updates as we walk back.
        refreshThreads();
        if (partnersAfter >= ENOUGH_PARTNERS) { console.log('[dm-walker] enough partners, stopping'); break; }
        // Only early-exit on a "stable empty" signal. If we got 0 events
        // in window 1 it's almost certainly because the SimplePool was
        // still opening sockets — give the next window a chance with
        // warm connections before bailing. Stop only when (a) we've
        // already found partners and the next window adds nothing, or
        // (b) we've walked at least 2 windows and still see nothing.
        if (partnersAfter === partnersBefore && (partnersAfter > 0 || i >= 1)) {
          console.log('[dm-walker] no new partners in window, stopping');
          break;
        }
        until -= WINDOW_SEC;
      }
    })();
  }, [isDMMode, ndkReady, profilePubkey, refreshThreads]);

  return { runDMDiscovery: refreshThreads };
}
