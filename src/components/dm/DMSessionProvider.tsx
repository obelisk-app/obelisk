'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeLive, loadHistory, sendDM, discoverNip17Partners, fetchMyInboxRelays, fetchMyDmRelays, type DMProtocol } from '@/lib/dm/dm';
import { hydrateFollows } from '@/lib/dm/follows';
import { getOrCreateCacheKey } from '@/lib/dm/cache-key';
import { subscribeToCacheTick } from '@/lib/dm/dm-cache';
import { useDMStore } from '@/store/dm';
import { formatPubkey, getNDK } from '@/lib/nostr';
import { toKEKSigner } from '@/lib/signer-adapters';
import { useAuthStore } from '@/store/auth';

interface DMSessionContextValue {
  ready: boolean;
  myPubkey: string;
  cacheKey: CryptoKey | null;
  loadThread: (partner: string) => void;
  send: (partner: string, content: string, protocol?: DMProtocol) => Promise<void>;
}

const DMSessionContext = createContext<DMSessionContextValue | null>(null);

async function getExtensionRelays(): Promise<string[]> {
  if (typeof window === 'undefined') return [];
  const nostr = (window as unknown as {
    nostr?: { getRelays?: () => Promise<Record<string, { read?: boolean; write?: boolean }>> };
  }).nostr;
  if (!nostr?.getRelays) return [];
  try {
    const map = await nostr.getRelays();
    if (!map || typeof map !== 'object') return [];
    return Array.from(new Set(
      Object.keys(map).filter((url) => typeof url === 'string' && url.startsWith('wss://')),
    ));
  } catch {
    return [];
  }
}

export function useDMSession(): DMSessionContextValue {
  const v = useContext(DMSessionContext);
  if (!v) throw new Error('useDMSession must be used inside DMSessionProvider');
  return v;
}

export function DMSessionProvider({ myPubkey, children }: { myPubkey: string; children: React.ReactNode }) {
  const [cacheKey, setCacheKey] = useState<CryptoKey | null>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const signerReady = useAuthStore((s) => s.signerReady);

  useEffect(() => {
    hydrateFollows(myPubkey);
  }, [myPubkey]);

  useEffect(() => {
    const ndk = getNDK();
    if (!ndk.signer) return;
    let cancelled = false;
    (async () => {
      try {
        const kekSigner = toKEKSigner(ndk, ndk.signer, myPubkey);
        if (!kekSigner) return;
        const k = await getOrCreateCacheKey(myPubkey, kekSigner);
        if (!cancelled) setCacheKey(k);
      } catch (err) {
        console.warn('[dm] cache key unavailable:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [myPubkey, signerReady]);

  useEffect(() => {
    const ndk = getNDK();
    let cancelled = false;
    let activeClose: (() => void) | null = null;

    void (async () => {
      const poolRelays = Array.from(ndk.pool?.relays?.keys?.() ?? []) as string[];
      // Same merge strategy as useDMLifecycle's walker: pool + extension's
      // canonical relay list + kind 10050 inbox + NIP-65 read/write. The
      // extension is the single most reliable source — it always knows the
      // user's configured set, even when their kind 10002/10050 events
      // can't be located on any of our search relays.
      const aggregators = [
        'wss://purplepag.es',
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://nostr.wine',
      ];
      const extensionRelays = await getExtensionRelays();
      const searchRelays = Array.from(new Set([
        ...poolRelays,
        ...extensionRelays,
        ...aggregators,
      ]));
      const [inboxRelays, dmRelays] = await Promise.all([
        fetchMyInboxRelays({ myPubkey, searchRelays }).catch(() => [] as string[]),
        fetchMyDmRelays({ myPubkey, searchRelays }).catch(() => [] as string[]),
      ]);
      if (cancelled) return;
      const myInboxRelays = Array.from(new Set([
        ...poolRelays,
        ...extensionRelays,
        ...inboxRelays,
        ...dmRelays,
      ]));
      const close = subscribeLive({ myPubkey, myInboxRelays });
      activeClose = close;
      closeRef.current = close;
    })();

    return () => {
      cancelled = true;
      if (activeClose) {
        activeClose();
        closeRef.current = null;
      }
    };
  }, [myPubkey]);

  // NIP-17 partner discovery. Gift wraps (kind 1059) hide the partner
  // pubkey behind two NIP-44 layers — useDMLifecycle's NIP-04-only walk
  // can't see them. Decrypt the newest cached wraps here (we have the
  // signer + cache key), then push discovered partners into the thread
  // store so the inbox surfaces NIP-17 conversations even before the
  // user opens any thread.
  //
  // Bounded to ~30 wraps per pass to keep the signer-prompt count
  // tolerable on extensions that prompt per call. Re-runs on cache-tick
  // (new wraps arrive via subscribeLive / loadInboxWindow), but the
  // already-decrypted ones hit the secrets cache fast-path so the prompt
  // budget only burns on truly-new wraps.
  useEffect(() => {
    if (!cacheKey) return;
    const ndk = getNDK();
    if (!ndk.signer) return;

    let cancelled = false;
    let inFlight = false;

    const projectPartners = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const found = await discoverNip17Partners({
          myPubkey,
          ndk,
          signer: ndk.signer,
          cacheKey,
          limit: 30,
        });
        if (cancelled || found.length === 0) return;
        const dmStore = useDMStore.getState();
        const byPubkey = new Map(dmStore.threads.map((t) => [t.pubkey, t]));
        for (const { partner, lastMessageAt } of found) {
          const existing = byPubkey.get(partner);
          byPubkey.set(partner, {
            pubkey: partner,
            displayName: existing?.displayName || formatPubkey(partner),
            picture: existing?.picture,
            lastMessage: existing?.lastMessage ?? '',
            lastMessageAt: Math.max(existing?.lastMessageAt ?? 0, lastMessageAt),
            unreadCount: existing?.unreadCount ?? 0,
            protocol: existing?.protocol ?? 'nip17',
          });
        }
        dmStore.setThreads(
          Array.from(byPubkey.values()).sort(
            (a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0),
          ),
        );
      } catch (err) {
        console.warn('[dm] nip17 discovery failed:', err);
      } finally {
        inFlight = false;
      }
    };

    // Initial pass — covers wraps already in the cache from prior session.
    void projectPartners();

    // Re-run on cache-tick. subscribeToCacheTick fires when putEvent is
    // called from any source (live tail, inbox walker, loadOlder). We
    // debounce by 1s so a burst of wraps from a window walker doesn't
    // spawn N parallel decrypt passes.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeToCacheTick((pubkey) => {
      if (pubkey !== myPubkey) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void projectPartners(); }, 1000);
    });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsub();
    };
  }, [cacheKey, myPubkey]);

  const value = useMemo<DMSessionContextValue>(() => ({
    ready: cacheKey !== null,
    myPubkey,
    cacheKey,
    loadThread: (partner) => loadHistory(myPubkey, partner),
    send: async (partner, content, protocol = 'nip17') => {
      await sendDM({ myPubkey, recipientPubkey: partner, content, protocol });
    },
  }), [cacheKey, myPubkey]);

  return <DMSessionContext.Provider value={value}>{children}</DMSessionContext.Provider>;
}
