import { captureActiveSession } from '@/services/session/connection';
import { requestZapInvoice } from '@nostr-wot/wallet';
import { getDefaultRelays } from '@nostr-wot/data';
import { getBridgeImpl, isImportableRelayUrl } from '@/services/nostr-bridge';
import { KIND_REACTION } from '@/constants/nostr/nip-kinds';
import type { NipSigner } from '@/types/nostr/nip-signer';
import { codeOrMessage } from '@/utils/errors/codes';
import { connectWallet, isWalletAvailable } from './wallet';
import { MARKER_NO_BRIDGE } from '@/constants/wallet/zap';

/**
 * Sending a zap from a channel: pay through the user's wallet (`./wallet`, the
 * same path invoice cards pay through: a connected NWC wallet, else WebLN),
 * then post a ⚡ reaction carrying the invoice so everyone in the channel
 * sees it.
 *
 * Why not `zapViaWebLN` from @nostr-wot/wallet: it returns only the preimage,
 * and the in-channel marker needs the invoice and the signed zap request. If
 * the SDK returned those too, this could call it instead.
 */

/** Why a zap cannot start, in the order the checks run. The UI translates these. */
export type ZapErrorCode = 'noAddress' | 'noWallet' | 'invalidAmount' | 'noSigner';

export class ZapError extends Error {
  constructor(readonly code: ZapErrorCode) {
    super(code);
    this.name = 'ZapError';
  }
}

export interface ZapRecipient {
  recipientPubkey: string;
  groupId: string;
  messageId?: string | null;
}

export type ZapSigner = Pick<NipSigner, 'pubkey' | 'signEvent'>;

export interface ZapDraft {
  recipient: ZapRecipient;
  amountSats: number;
  comment: string;
  lud16: string | null;
  signer: ZapSigner | null;
  currentRelay: string | null;
}

/** A draft that passed `checkZap`: address and signer are known. */
export interface ReadyZap extends ZapDraft {
  lud16: string;
  signer: ZapSigner;
}

export type ZapCheck = { ok: true; zap: ReadyZap } | { ok: false; reason: ZapErrorCode };

/** The first reason this zap cannot start, before anything leaves the browser. */
export function checkZap(draft: ZapDraft): ZapCheck {
  if (!draft.lud16) return { ok: false, reason: 'noAddress' };
  if (!isWalletAvailable(draft.signer?.pubkey ?? null)) return { ok: false, reason: 'noWallet' };
  if (!draft.amountSats || draft.amountSats <= 0) return { ok: false, reason: 'invalidAmount' };
  if (!draft.signer) return { ok: false, reason: 'noSigner' };
  return { ok: true, zap: { ...draft, lud16: draft.lud16, signer: draft.signer } };
}

export interface ZapResult {
  /**
   * Set when the payment went through but the in-channel marker could not be
   * posted: the relay's own reason, or `MARKER_NO_BRIDGE`.
   */
  markerError: string | null;
}

/**
 * Pays the zap, then posts its marker. Throws only while no money has moved,
 * or with an error `mayHavePaid` recognises when the wallet went silent
 * after the request was sent (the UI must not offer a retry then: a retry
 * asks for a fresh invoice, which would pay twice). Once the payment
 * succeeds the result is always a success, with `markerError` set if the
 * marker could not be posted.
 */
export async function sendZap(zap: ReadyZap): Promise<ZapResult> {
  const session = captureActiveSession(zap.signer.pubkey);
  const wallet = await connectWallet(zap.signer.pubkey);
  if (!wallet) throw new ZapError('noWallet');

  const relays = Array.from(new Set([
    ...(zap.currentRelay ? [zap.currentRelay] : []),
    ...getDefaultRelays(),
  ].filter(isImportableRelayUrl)));
  const amountMsats = zap.amountSats * 1000;
  const { invoice, zapRequest } = await requestZapInvoice({
    getPublicKey: async () => zap.signer.pubkey,
    signEvent: (template) => zap.signer.signEvent(template),
  }, {
    recipientPubkey: zap.recipient.recipientPubkey,
    lud16: zap.lud16,
    eventId: zap.recipient.messageId ?? undefined,
    amountMsats,
    relays,
    comment: zap.comment.trim() || undefined,
  });

  await wallet.pay(invoice);
  if (!session?.isCurrent()) return { markerError: getBridgeImpl() ? 'not-logged-in' : MARKER_NO_BRIDGE };
  return postZapMarker(zap, { invoice, zapRequest, amountMsats });
}

async function postZapMarker(
  zap: ReadyZap,
  paid: { invoice: string; zapRequest: unknown; amountMsats: number },
): Promise<ZapResult> {
  const { recipient, currentRelay } = zap;
  const tags: string[][] = [
    ...(recipient.messageId ? [['e', recipient.messageId]] : []),
    ['p', recipient.recipientPubkey],
    ['h', recipient.groupId],
    ['amount', String(paid.amountMsats), 'msat'],
    ['bolt11', paid.invoice],
    ['description', JSON.stringify(paid.zapRequest)],
  ];
  const bridge = getBridgeImpl();
  // The money has already moved. Reporting this as a failed zap would invite
  // the user to press Zap again and pay twice.
  if (!bridge) return { markerError: MARKER_NO_BRIDGE };
  try {
    await bridge.publishEvent(
      { kind: KIND_REACTION, content: '⚡', tags },
      currentRelay ? { extraRelays: [currentRelay] } : undefined,
    );
    return { markerError: null };
  } catch (e) {
    // A code when the bridge gave one, so the toast can say it in the reader's language.
    return { markerError: codeOrMessage(e) };
  }
}
