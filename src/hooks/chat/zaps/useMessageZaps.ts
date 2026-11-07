'use client';

import { KIND_REACTION, KIND_ZAP_RECEIPT } from '@/constants/nostr/nip-kinds';

// src/hooks/chat/zaps/useMessageZaps.ts
// Subscribes to NIP-57 kind 9735 zap-receipt events that target any of the
// given message ids and aggregates totals per message. The recipient pubkey
// for validation is read from the receipt's nested zap-request `p` tag, so
// this hook works for any author (not just the current user).

import { tagValue } from '@/utils/social/note-tags';
import { useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { zapReactionEntry, type ReceiptEntry } from '@/utils/wallet/zap-events';
import { validateZapReceipt, type RawNostrEvent } from '@nostr-wot/wallet';
import { useBridge, useCurrentRelayUrl } from '@/services/nostr-bridge';

export interface MessageZapTotal {
  totalSats: number;
  count: number;
  zappers: Set<string>;
  zapperAmounts: Map<string, number>;
}

export function useMessageZaps(messageIds: ReadonlyArray<string>): Map<string, MessageZapTotal> {
  const [receipts, setReceipts] = useState<{ relay: string | null; entries: Map<string, ReceiptEntry> }>(() => ({ relay: null, entries: new Map() }));
  const relay = useCurrentRelayUrl();
  const bridge = useBridge();

  // Stable key so a re-render of the same id list doesn't re-subscribe.
  const idsKey = useMemo(() => [...messageIds].sort().join(','), [messageIds]);

  useEffect(() => {
    if (!idsKey || !relay || !bridge) return;
    let active = true;
    const ids = idsKey.split(',').filter(Boolean);
    if (ids.length === 0) return;

    const handle = (raw: NostrEvent | RawNostrEvent) => {
      const ev = raw as RawNostrEvent;
      const reactionEntry = zapReactionEntry(ev, ids);
      if (reactionEntry) {
        setReceipts((prev) => {
          if (!active) return prev;
          const next = new Map(prev.relay === relay ? prev.entries : []);
          if (next.has(reactionEntry.dedupeKey)) return prev;
          next.set(reactionEntry.dedupeKey, reactionEntry);
          if (next.size > 5000) next.delete(next.keys().next().value!);
          return { relay, entries: next };
        });
        return;
      }

      if (ev.kind !== KIND_ZAP_RECEIPT) return;
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
        const dedupeKey = tagValue(ev, 'bolt11') || validated.receiptId;
        if (!active) return prev;
        const next = new Map(prev.relay === relay ? prev.entries : []);
        if (next.get(dedupeKey)?.verified) return prev;
        next.set(dedupeKey, {
          dedupeKey,
          verified: true,
          messageId: validated.messageId!,
          senderPubkey: validated.senderPubkey,
          amountMsat: validated.amountMsat,
        });
        if (next.size > 5000) next.delete(next.keys().next().value!);
        return { relay, entries: next };
      });
    };

    const release = bridge.subscribeFilterWatched(
      { kinds: [KIND_REACTION, KIND_ZAP_RECEIPT], '#e': ids }, handle,
    );
    return () => { active = false; release(); };
  }, [idsKey, relay, bridge]);

  return useMemo(() => {
    const out = new Map<string, MessageZapTotal>();
    if (receipts.relay !== relay) return out;
    const ids = new Set(messageIds);
    for (const r of receipts.entries.values()) {
      if (!ids.has(r.messageId)) continue;
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
  }, [receipts, relay, messageIds]);
}
