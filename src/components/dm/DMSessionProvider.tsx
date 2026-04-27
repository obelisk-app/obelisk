'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeLive, loadHistory, sendDM, discoverNip17Partners, fetchMyInboxRelays, fetchMyDmRelays, type DMProtocol, type DMMessage } from '@/lib/dm/dm';
import { hydrateFollows } from '@/lib/dm/follows';
import { getOrCreateCacheKey } from '@/lib/dm/cache-key';
import { getCachedEvents, subscribeToCacheTick } from '@/lib/dm/dm-cache';
import { decryptToEnvelope, partnerOfEnvelope } from '@/lib/dm/decrypt';
import { useDMStore } from '@/store/dm';
import { formatPubkey, getNDK } from '@/lib/nostr';
import { toKEKSigner } from '@/lib/signer-adapters';
import { useAuthStore } from '@/store/auth';

interface DMSessionContextValue {
  ready: boolean;
  myPubkey: string;
  cacheKey: CryptoKey | null;
  /** Decrypted messages keyed by partner pubkey, sorted oldest→newest.
   *  Populated incrementally by the provider's decryption pipeline. Sidebar
   *  + chat read from the same map — no per-thread re-decrypt on switch. */
  threads: Record<string, DMMessage[]>;
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

// Stable empty array — referential identity matters because consumers
// `useEffect(...,[messages])` against the return value, and a fresh `[]`
// on every render would trigger an infinite update loop.
const EMPTY_THREAD: DMMessage[] = Object.freeze([]) as unknown as DMMessage[];

/** Decrypted message list for a partner. Re-renders when ANY partner's
 *  thread updates today (the threads map is replaced); upgrade later if
 *  needed by selecting per-partner via useSyncExternalStore + slot.
 *  Returns the shared `EMPTY_THREAD` when no messages exist for this
 *  partner, OR outside the provider — so consumers can be unit-tested
 *  without a wrapping `<DMSessionProvider>`. */
export function useDMThread(partner: string | null | undefined): DMMessage[] {
  const ctx = useContext(DMSessionContext);
  if (!ctx || !partner) return EMPTY_THREAD;
  return ctx.threads[partner] ?? EMPTY_THREAD;
}

/** Most recent decrypted message for a partner — drives sidebar previews. */
export function useLastDM(partner: string | null | undefined): DMMessage | null {
  const list = useDMThread(partner);
  return list.length > 0 ? list[list.length - 1] : null;
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

  // ── Decrypted-thread state ────────────────────────────────────────────
  // Single source of truth for plaintext DMs across the app. Sidebar reads
  // `threads[partner].at(-1)` for previews; DMChat reads `threads[partner]`
  // for the full thread. Decryption happens once per event globally — on
  // the cache-tick fired by every cache mutation (live sub, walker, send).
  // Subsequent thread-switches are a Map lookup, no signer round-trip.
  const [threads, setThreads] = useState<Record<string, DMMessage[]>>({});
  // Event-id set tracking what we've already decrypted (or attempted).
  // Survives across cache ticks so the loop only ever processes brand-new
  // events. Cleared on `myPubkey` change (account switch).
  const processedRef = useRef<Set<string>>(new Set());
  // Re-entry guard. The cache-tick can fire mid-decrypt (the relay sub
  // pushes events as they arrive); without this we'd burn signer prompts
  // on the same event multiple times in parallel.
  const decryptingRef = useRef(false);

  // Hard cap on how many newest unprocessed events we decrypt per pass.
  // Smaller-than-intuition on purpose: the first batch is the user's
  // first paint after a fresh login, and signer prompts (NIP-17 unwrap on
  // cold wraps, NIP-04 nip04Decrypt) gate the whole UI. 10 lets the most
  // recent thread's last few messages + each partner's freshest preview
  // appear quickly; the 2s backfill interval below keeps eating older
  // events in the background.
  const DECRYPT_BATCH = 10;

  const decryptPass = useCallback(async () => {
    if (!cacheKey || decryptingRef.current) return;
    decryptingRef.current = true;
    try {
      const candidates = getCachedEvents(myPubkey)
        .filter((ev) => (ev.kind === 4 || ev.kind === 1059) && !processedRef.current.has(ev.id))
        .sort((a, b) => b.created_at - a.created_at) // newest-first
        .slice(0, DECRYPT_BATCH);
      if (candidates.length === 0) return;

      const updates: Record<string, DMMessage[]> = {};
      for (const ev of candidates) {
        processedRef.current.add(ev.id); // mark before decrypt to avoid retry loops
        const env = await decryptToEnvelope(myPubkey, cacheKey, ev);
        if (!env) continue;
        const partner = partnerOfEnvelope(env, myPubkey);
        if (!partner) continue;
        const msg: DMMessage = {
          id: ev.id,
          senderPubkey: env.senderPubkey,
          recipientPubkey: env.recipientPubkey,
          content: env.content,
          createdAt: env.createdAt,
          protocol: env.protocol,
        };
        (updates[partner] ??= []).push(msg);
      }
      if (Object.keys(updates).length === 0) return;

      setThreads((prev) => {
        const next: Record<string, DMMessage[]> = { ...prev };
        for (const [partner, fresh] of Object.entries(updates)) {
          const merged = [...(next[partner] ?? []), ...fresh];
          // Dedup by id (different relays, same event) and sort
          // oldest→newest for stable scroll-to-bottom semantics.
          const seen = new Set<string>();
          const unique = merged.filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          unique.sort((a, b) => a.createdAt - b.createdAt);
          next[partner] = unique;
        }
        return next;
      });
    } finally {
      decryptingRef.current = false;
    }
  }, [cacheKey, myPubkey]);

  // Reset processed set + decrypted threads on identity / cache-key change.
  // The decrypted map is per-account and per-KEK — leaking across accounts
  // would surface another user's plaintext.
  useEffect(() => {
    processedRef.current = new Set();
    setThreads({});
  }, [myPubkey, cacheKey]);

  // Drive the pipeline: fire once on mount/cache-key-arrival, then on every
  // cache mutation. Debounced 200ms so a burst of inbox-walker writes
  // collapses to one decrypt pass; the pass itself loops if more work
  // remains beyond the per-batch cap.
  useEffect(() => {
    if (!cacheKey) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const kick = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void decryptPass(); }, 200);
    };
    kick();
    const unsub = subscribeToCacheTick((pk) => {
      if (pk !== myPubkey) return;
      kick();
    });
    return () => {
      if (debounce) clearTimeout(debounce);
      unsub();
    };
  }, [cacheKey, myPubkey, decryptPass]);

  // After a batch completes with `unprocessed > DECRYPT_BATCH`, the loop
  // self-reschedules: the next pass picks up older events. Bounded by the
  // cache-tick re-entrance + the processedRef so we never re-decrypt the
  // same event.
  useEffect(() => {
    if (!cacheKey) return;
    const interval = setInterval(() => { void decryptPass(); }, 2000);
    return () => clearInterval(interval);
  }, [cacheKey, decryptPass]);

  const value = useMemo<DMSessionContextValue>(() => ({
    ready: cacheKey !== null,
    myPubkey,
    cacheKey,
    threads,
    loadThread: (partner) => loadHistory(myPubkey, partner),
    send: async (partner, content, protocol = 'nip17') => {
      await sendDM({ myPubkey, recipientPubkey: partner, content, protocol });
    },
  }), [cacheKey, myPubkey, threads]);

  // NOTE: ProfileProvider used to live inside this component, but DMList
  // is mounted in the sidebar SIBLING of <DMSessionProvider>, so wrapping
  // here left the sidebar outside the profile context. The profile
  // provider now lives at the chat-page level (around both sidebar and
  // main panel), so sidebar threads and chat bubbles share one map.
  return <DMSessionContext.Provider value={value}>{children}</DMSessionContext.Provider>;
}
