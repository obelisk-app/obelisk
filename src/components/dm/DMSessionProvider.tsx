'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeLive, loadHistory, sendDM, type DMProtocol } from '@/lib/dm/dm';
import { hydrateFollows } from '@/lib/dm/follows';
import { getOrCreateCacheKey } from '@/lib/dm/cache-key';
import { getNDK } from '@/lib/nostr';
import { toKEKSigner } from '@/lib/ndk-kek-signer';
import { useAuthStore } from '@/store/auth';

interface DMSessionContextValue {
  ready: boolean;
  myPubkey: string;
  cacheKey: CryptoKey | null;
  loadThread: (partner: string) => void;
  send: (partner: string, content: string, protocol?: DMProtocol) => Promise<void>;
}

const DMSessionContext = createContext<DMSessionContextValue | null>(null);

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
    const myInboxRelays = Array.from(ndk.pool?.relays?.keys?.() ?? []) as string[];
    const close = subscribeLive({ myPubkey, myInboxRelays });
    closeRef.current = close;
    return () => { close(); closeRef.current = null; };
  }, [myPubkey]);

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
