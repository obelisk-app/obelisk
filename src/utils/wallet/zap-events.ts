import { KIND_REACTION } from '@/constants/nostr/nip-kinds';
import { tagValue } from '@/utils/social/note-tags';
import type { Event as NostrEvent } from 'nostr-tools/pure';
import { parseZapMsats } from '@nostr-wot/data';
import type { RawNostrEvent } from '@nostr-wot/wallet';

export interface ReceiptEntry {
  dedupeKey: string;
  verified?: boolean;
  messageId: string;
  senderPubkey: string;
  amountMsat: number;
}

function tagAmountMsat(tags: string[][], name: string, defaultUnit = 'msat'): number {
  const tag = tags.find((t) => t[0] === name);
  if (!tag?.[1]) return 0;
  const amount = Number(tag[1]);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const unit = (tag[2] || defaultUnit).toLowerCase();
  return ['sat', 'sats', 'satoshi', 'satoshis'].includes(unit)
    ? Math.floor(amount * 1000)
    : Math.floor(amount);
}

export function zapReactionEntry(ev: RawNostrEvent, ids: readonly string[]): ReceiptEntry | null {
  if (ev.kind !== KIND_REACTION || !ev.content.includes('⚡')) return null;
  const messageId = tagValue(ev, 'e');
  if (!messageId || !ids.includes(messageId)) return null;
  const recipient = tagValue(ev, 'p');
  if (!recipient) return null;

  const amountMsat =
    parseZapMsats(ev as unknown as NostrEvent)
    || tagAmountMsat(ev.tags, 'amount')
    || tagAmountMsat(ev.tags, 'msat')
    || tagAmountMsat(ev.tags, 'msats')
    || tagAmountMsat(ev.tags, 'millisats')
    || tagAmountMsat(ev.tags, 'sat', 'sat')
    || tagAmountMsat(ev.tags, 'sats', 'sat');
  if (amountMsat <= 0) return null;

  return {
    dedupeKey: tagValue(ev, 'bolt11') || ev.id,
    messageId,
    senderPubkey: ev.pubkey,
    amountMsat,
  };
}

