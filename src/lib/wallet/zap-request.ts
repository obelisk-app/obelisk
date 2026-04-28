// src/lib/wallet/zap-request.ts
// Builds a signed NIP-57 kind 9734 zap-request event. The recipient's
// LNURL provider commits to this event in the BOLT11 invoice's description
// hash and later signs a kind 9735 receipt referencing it. The receipt
// is the proof of payment used by the recipient's client to validate
// incoming zaps without trusting any server.

export interface ZapRequestTemplate {
  kind: 9734;
  created_at: number;
  tags: string[][];
  content: string;
}

export interface ZapRequestSignedEvent extends ZapRequestTemplate {
  pubkey: string;
  id: string;
  sig: string;
}

export interface ZapRequestSigner {
  signEvent(template: ZapRequestTemplate): Promise<ZapRequestSignedEvent>;
}

export interface ZapRequestParams {
  recipientPubkey: string;
  amountMsat: number;
  relays: string[];
  /** Optional event id when zapping a specific message. */
  messageId?: string;
  /** Optional free-form comment shown in the recipient's notification. */
  comment?: string;
}

export async function buildZapRequest(
  signer: ZapRequestSigner,
  params: ZapRequestParams,
): Promise<ZapRequestSignedEvent> {
  if (params.amountMsat <= 0) throw new Error('amountMsat must be positive');
  if (!params.relays || params.relays.length === 0) throw new Error('relays must not be empty (NIP-57 requires at least one relay)');

  const tags: string[][] = [
    ['amount', String(params.amountMsat)],
    ['p', params.recipientPubkey],
    ['relays', ...params.relays],
  ];
  if (params.messageId) tags.push(['e', params.messageId]);

  const template: ZapRequestTemplate = {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: params.comment ?? '',
  };
  return signer.signEvent(template);
}
