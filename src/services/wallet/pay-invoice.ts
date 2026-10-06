import type { ParsedInvoice } from '@/utils/bolt11';
import { useInvoicePaymentsStore } from '@/store/invoice-payments';
import { registerClientResetHook } from '@/services/reset';
import { connectWallet, isWalletAvailable } from './wallet';

/**
 * Paying a BOLT11 invoice posted in chat, through the same wallet path zaps
 * use (`./wallet`).
 *
 * The double-pay rules, which the UI relies on:
 * - the invoice is claimed in the payments store before the first `await`,
 *   so a second click or a second card for the same invoice is refused;
 * - the claim is given back only when the wallet failed, never after it
 *   reported the payment done;
 * - once the wallet reports it done the invoice is marked paid before any
 *   other code runs, so nothing that fails afterwards can make it payable.
 */

/** Why an invoice cannot be paid, in the order the checks run. The UI translates these. */
export type InvoicePayRefusal = 'alreadyPaid' | 'inProgress' | 'noAmount' | 'expired' | 'noWallet';

export class InvoicePayError extends Error {
  constructor(readonly code: InvoicePayRefusal) {
    super(code);
    this.name = 'InvoicePayError';
  }
}

/**
 * Past its expiry, by the rule `useHasExpired` uses. An invoice whose
 * expiry is 0 (none was decoded) never expires here.
 */
export function isInvoiceExpired(parsed: ParsedInvoice, nowMs: number = Date.now()): boolean {
  return !!parsed.expiresAt && parsed.expiresAt < Math.floor(nowMs / 1000);
}

/**
 * The first reason this browser cannot pay the invoice now, or null.
 *
 * An invoice with no amount is refused rather than asking for one: WebLN's
 * `sendPayment` takes only the invoice, so there is no way to hand the
 * wallet an amount to pay it with.
 */
export function invoiceRefusal(parsed: ParsedInvoice, nowMs: number = Date.now()): InvoicePayRefusal | null {
  const record = useInvoicePaymentsStore.getState().byHash[parsed.paymentHash];
  if (record?.status === 'paid') return 'alreadyPaid';
  if (record?.status === 'paying') return 'inProgress';
  if (parsed.amountMsats <= 0) return 'noAmount';
  if (isInvoiceExpired(parsed, nowMs)) return 'expired';
  if (!isWalletAvailable()) return 'noWallet';
  return null;
}

/**
 * Pays the invoice once. Rejects with an `InvoicePayError` when it is
 * refused, or with the wallet's own error when the wallet failed (then the
 * invoice is payable again). Resolves once the invoice is recorded as paid.
 */
export async function payInvoice(invoice: string, parsed: ParsedInvoice, payerPubkey: string | null): Promise<void> {
  const refusal = invoiceRefusal(parsed);
  if (refusal) throw new InvoicePayError(refusal);
  const payments = useInvoicePaymentsStore.getState();
  if (!payments.claim(parsed.paymentHash)) throw new InvoicePayError('inProgress');

  try {
    const wallet = await connectWallet();
    if (!wallet) throw new InvoicePayError('noWallet');
    await wallet.pay(invoice);
  } catch (e) {
    payments.release(parsed.paymentHash);
    throw e;
  }
  payments.markPaid(parsed.paymentHash, payerPubkey);
}

// The next account on this browser should not see who paid what. A payment
// still in flight keeps its claim, so a logout mid-payment cannot reopen it.
registerClientResetHook(() => useInvoicePaymentsStore.getState().forgetPaid());
