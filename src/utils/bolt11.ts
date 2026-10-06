import { decode } from 'light-bolt11-decoder';

export interface ParsedInvoice {
  paymentHash: string;
  amountSats: number;
  description: string;
  expiresAt: number; // unix seconds
  timestamp: number;
}

/**
 * Parse a BOLT11 invoice and extract the fields the chat UI + pay flow need.
 * Throws on malformed invoices.
 */
export function parseBolt11(invoice: string): ParsedInvoice {
  const dec = decode(invoice);
  let paymentHash = '';
  let description = '';
  let amountSats = 0;
  let timestamp = 0;
  for (const s of dec.sections) {
    if (s.name === 'payment_hash') paymentHash = s.value as string;
    if (s.name === 'description') description = (s.value as string) ?? '';
    if (s.name === 'amount') amountSats = Math.floor(Number(s.value) / 1000);
    if (s.name === 'timestamp') timestamp = Number(s.value);
  }
  if (!paymentHash) throw new Error('invoice missing payment_hash');
  const expiry = Number(dec.expiry) || 3600;
  return {
    paymentHash,
    amountSats,
    description,
    timestamp,
    expiresAt: timestamp + expiry,
  };
}

/** Matches BOLT11 mainnet/testnet/regtest invoices inside a message body. */
export const INVOICE_REGEX = /\b(lnbc|lntb|lnbcrt)[0-9a-z]{50,}\b/gi;
