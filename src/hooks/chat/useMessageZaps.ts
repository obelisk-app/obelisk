'use client';

// src/hooks/chat/useMessageZaps.ts
// Subscribes to NIP-57 kind 9735 zap-receipt events that target any of the
// given message ids and aggregates totals per message. The recipient pubkey
// for validation is read from the receipt's nested zap-request `p` tag, so
// this hook works for any author (not just the current user).

import { useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { sharedCoalescer } from '@/lib/nostr-coalescer';
import { getNDK } from '@/lib/nostr';
import { validateZapReceipt, type RawNostrEvent } from '@/lib/wallet/zap-receipt';

export interface MessageZapTotal {
  totalSats: number;
  count: number;
  zappers: Set<string>;
  zapperAmounts: Map<string, number>;
}

interface ReceiptEntry {
  receiptId: string;
  messageId: string;
  senderPubkey: string;
  amountMsat: number;
}

export function useMessageZaps(messageIds: ReadonlyArray<string>): Map<string, MessageZapTotal> {
  const [receipts, setReceipts] = useState<Map<string, ReceiptEntry>>(() => new Map());

  // Stable key so a re-render of the same id list doesn't re-subscribe.
  const idsKey = useMemo(() => [...messageIds].sort().join(','), [messageIds]);

  useEffect(() => {
    if (!idsKey) return;
    const ids = idsKey.split(',').filter(Boolean);
    if (ids.length === 0) return;

    const ndk = getNDK();
    const relays = Array.from((ndk.pool?.relays as Map<string, unknown> | undefined)?.keys?.() ?? []) as string[];
    if (relays.length === 0) return;

    const handle = (raw: NostrEvent | RawNostrEvent) => {
      const ev = raw as RawNostrEvent;
      // Receipt's outer `e` tag points at the zapped message; use it to find
      // the expected recipient (the message author's pubkey is in the nested
      // zap-request's `p` tag, which validateZapReceipt already cross-checks).
      const eTag = ev.tags.find((t) => t[0] === 'e')?.[1];
      if (!eTag || !ids.includes(eTag)) return;
      const pTag = ev.tags.find((t) => t[0] === 'p')?.[1];
      if (!pTag) return;
      const validated = validateZapReceipt(ev, pTag);
      if (!validated || !validated.messageId) return;

      setReceipts((prev) => {
        if (prev.has(validated.receiptId)) return prev;
        const next = new Map(prev);
        next.set(validated.receiptId, {
          receiptId: validated.receiptId,
          messageId: validated.messageId!,
          senderPubkey: validated.senderPubkey,
          amountMsat: validated.amountMsat,
        });
        return next;
      });
    };

    return sharedCoalescer.enqueue({
      filters: [{ kinds: [9735], '#e': ids }],
      relays,
      onEvent: handle,
    });
  }, [idsKey]);

  return useMemo(() => {
    const out = new Map<string, MessageZapTotal>();
    for (const r of receipts.values()) {
      let entry = out.get(r.messageId);
      if (!entry) {
        entry = { totalSats: 0, count: 0, zappers: new Set(), zapperAmounts: new Map() };
        out.set(r.messageId, entry);
      }
      const sats = Math.floor(r.amountMsat / 1000);
      entry.totalSats += sats;
      entry.count += 1;
      entry.zappers.add(r.senderPubkey);
      entry.zapperAmounts.set(r.senderPubkey, (entry.zapperAmounts.get(r.senderPubkey) ?? 0) + sats);
    }
    return out;
  }, [receipts]);
}
