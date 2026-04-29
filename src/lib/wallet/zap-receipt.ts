// src/lib/wallet/zap-receipt.ts
// Pure validator for NIP-57 kind 9735 zap-receipt events. Returns the
// canonical sender + amount when the receipt is well-formed and
// recipient-matched, else null. Caller is responsible for verifying the
// signature (callers are responsible for verification); this validator focuses
// on payload-shape and recipient checks.

export interface RawNostrEvent {
  kind: number;
  pubkey: string;
  tags: string[][];
  content: string;
  id: string;
  sig: string;
  created_at: number;
}

export interface ValidatedZapReceipt {
  senderPubkey: string;
  amountMsat: number;
  bolt11: string;
  messageId?: string;
  comment?: string;
  /** The id of the receipt event (for de-dup). */
  receiptId: string;
  /** The signer of the receipt — the recipient's LNURL provider. */
  providerPubkey: string;
}

function getTag(ev: RawNostrEvent, name: string): string[] | undefined {
  return ev.tags.find((t) => t[0] === name);
}

export function validateZapReceipt(
  event: RawNostrEvent,
  expectedRecipient: string,
  trustedProviderPubkeys?: Set<string>,
): ValidatedZapReceipt | null {
  if (event.kind !== 9735) return null;

  const pTag = getTag(event, 'p');
  if (!pTag || pTag[1] !== expectedRecipient) return null;

  const bolt11Tag = getTag(event, 'bolt11');
  if (!bolt11Tag || typeof bolt11Tag[1] !== 'string' || bolt11Tag[1].length === 0) return null;

  const descTag = getTag(event, 'description');
  if (!descTag || typeof descTag[1] !== 'string') return null;

  let zapRequest: RawNostrEvent | null = null;
  try {
    zapRequest = JSON.parse(descTag[1]) as RawNostrEvent;
  } catch {
    return null;
  }
  if (!zapRequest || zapRequest.kind !== 9734 || typeof zapRequest.pubkey !== 'string') return null;

  const zrPTag = getTag(zapRequest, 'p');
  if (!zrPTag || zrPTag[1] !== expectedRecipient) return null;

  const amountTag = getTag(zapRequest, 'amount');
  if (!amountTag) return null;
  const amountMsat = parseInt(amountTag[1] ?? '', 10);
  if (!Number.isFinite(amountMsat) || amountMsat <= 0) return null;

  if (trustedProviderPubkeys && !trustedProviderPubkeys.has(event.pubkey)) return null;

  const messageIdTag = getTag(event, 'e') ?? getTag(zapRequest, 'e');
  return {
    senderPubkey: zapRequest.pubkey,
    amountMsat,
    bolt11: bolt11Tag[1],
    messageId: messageIdTag?.[1],
    comment: zapRequest.content || undefined,
    receiptId: event.id,
    providerPubkey: event.pubkey,
  };
}
