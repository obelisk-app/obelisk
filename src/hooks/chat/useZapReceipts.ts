'use client';

// src/hooks/chat/useZapReceipts.ts
// Subscribes to NIP-57 kind 9735 zap-receipt events on the user's relays
// and shows a toast when one arrives. The receipt is signed by the
// recipient's LNURL provider — proof of payment that doesn't require
// trusting any Obelisk server.

import { useEffect } from 'react';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { subscribeStream } from '@/lib/nostr-resource';
import { getExplicitRelays, formatPubkey } from '@/lib/nostr';
import { useToastStore } from '@/store/toast';
import { useChatStore } from '@/store/chat';
import { validateZapReceipt, type RawNostrEvent } from '@/lib/wallet/zap-receipt';

export function useZapReceipts(myPubkey: string | null): void {
  useEffect(() => {
    if (!myPubkey) return;
    const relays = getExplicitRelays();

    return subscribeStream({
      filters: [{ kinds: [9735], '#p': [myPubkey] }],
      relays,
      // No replay: zap receipts are toasts. Anything that already fired
      // before this hook mounted has been displayed (or missed) — we don't
      // want to re-toast on every navigation back to chat.
      hydrate: () => [],
      // Validation is the gate: malformed or unrelated receipts (`p` tag
      // not addressed to us) are dropped silently before the stream
      // primitive sees them as "new".
      accept: (event: NostrEvent) =>
        validateZapReceipt(event as RawNostrEvent, myPubkey) !== null,
      // Persist is a no-op — zap receipts are surfaced as a UI toast and
      // not retained anywhere local.
      persist: () => { /* surfaced via onNew, not cached */ },
      onNew: (event: NostrEvent) => {
        const validated = validateZapReceipt(event as RawNostrEvent, myPubkey);
        if (!validated) return; // belt-and-braces — accept already gated
        const sats = Math.floor(validated.amountMsat / 1000);
        const senderName =
          useChatStore.getState().memberList?.find((m) => m.pubkey === validated.senderPubkey)?.displayName
          ?? formatPubkey(validated.senderPubkey);
        const amountLabel = sats > 0 ? `${sats.toLocaleString()} sats` : 'a zap';
        useToastStore.getState().pushToast({
          title: `⚡ ${senderName} sent ${amountLabel}`,
          body: validated.comment ?? `${amountLabel} · powered by nostr-wot`,
        });
      },
    });
  }, [myPubkey]);
}
