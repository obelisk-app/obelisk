/**
 * Wallet: bolt11. Values the code in `utils/wallet/bolt11.ts` reads, kept here
 * so every reader imports the one copy.
 */

/** Matches BOLT11 mainnet/testnet/regtest invoices inside a message body. */
export const INVOICE_REGEX = /\b(lnbc|lntb|lnbcrt)[0-9a-z]{50,}\b/gi;
