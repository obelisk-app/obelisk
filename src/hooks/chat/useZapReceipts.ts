'use client';

// src/hooks/chat/useZapReceipts.ts
// Subscribes to NIP-57 kind 9735 zap-receipt events on the user's relays
// and shows a toast when one arrives. The receipt is signed by the
// recipient's LNURL provider — proof of payment that doesn't require
// trusting any Obelisk server.

import { useEffect, useRef } from 'react';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { sharedCoalescer } from '@/lib/nostr-coalescer';
import { getNDK, formatPubkey } from '@/lib/nostr';
import { useToastStore } from '@/store/toast';
import { useChatStore } from '@/store/chat';
import { validateZapReceipt, type RawNostrEvent } from '@/lib/wallet/zap-receipt';

const SEEN_CAP = 200;

export function useZapReceipts(myPubkey: string | null): void {
  const seenRef = useRef<Set<string>>(new Set());
  const seenOrderRef = useRef<string[]>([]);

  useEffect(() => {
    if (!myPubkey) return;
    const ndk = getNDK();
    const relays = Array.from((ndk.pool?.relays as Map<string, unknown> | undefined)?.keys?.() ?? []) as string[];

    const handle = (raw: NostrEvent | RawNostrEvent) => {
      const ev = raw as RawNostrEvent;
      const validated = validateZapReceipt(ev, myPubkey);
      if (!validated) return;
      // De-dup: relays may re-send across reconnects.
      if (seenRef.current.has(validated.receiptId)) return;
      seenRef.current.add(validated.receiptId);
      seenOrderRef.current.push(validated.receiptId);
      if (seenOrderRef.current.length > SEEN_CAP) {
        const dropped = seenOrderRef.current.shift();
        if (dropped) seenRef.current.delete(dropped);
      }

      const sats = Math.floor(validated.amountMsat / 1000);
      const senderName =
        useChatStore.getState().memberList?.find((m) => m.pubkey === validated.senderPubkey)?.displayName
        ?? formatPubkey(validated.senderPubkey);

      const amountLabel = sats > 0 ? `${sats.toLocaleString()} sats` : 'a zap';
      useToastStore.getState().pushToast({
        title: `⚡ ${senderName} sent ${amountLabel}`,
        body: validated.comment ?? `${amountLabel} · powered by nostr-wot`,
      });
    };

    return sharedCoalescer.enqueue({
      filters: [{ kinds: [9735], '#p': [myPubkey] }],
      relays,
      onEvent: handle,
    });
  }, [myPubkey]);
}
