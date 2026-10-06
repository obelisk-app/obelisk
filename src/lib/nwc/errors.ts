/**
 * What can go wrong talking to a Nostr Wallet Connect (NIP-47) wallet, as a
 * code the app translates (the codes are the app's own error codes, the way
 * `AuthRefusedError.code` is in the relay hub), and whether money may have
 * moved.
 *
 * `outcome` is what keeps a caller from paying twice:
 * - `not-paid`: the request never reached the wallet, or the wallet answered
 *   with an error. Trying again is safe.
 * - `unknown`: the request was sent and no usable answer came back (a
 *   timeout, an answer that would not decrypt). The wallet may have paid; a
 *   caller must not offer to pay a fresh invoice as if nothing happened.
 *
 * No app imports: a mini-package.
 */

export type NwcErrorCode =
  | 'nwc-invalid-uri'
  | 'nwc-unreachable'
  | 'nwc-cannot-pay'
  | 'wallet-timeout'
  | 'wallet-relay-failed'
  | 'wallet-rate-limited'
  | 'wallet-not-supported'
  | 'wallet-insufficient-balance'
  | 'wallet-quota-exceeded'
  | 'wallet-restricted'
  | 'wallet-unauthorized'
  | 'wallet-payment-failed'
  | 'wallet-failed';

export type NwcOutcome = 'not-paid' | 'unknown';

export class NwcError extends Error {
  readonly code: NwcErrorCode;
  readonly outcome: NwcOutcome;
  /** The wallet's own NIP-47 error code (`INSUFFICIENT_BALANCE`, ...), when it sent one. */
  readonly walletCode: string | null;

  constructor(code: NwcErrorCode, outcome: NwcOutcome, walletCode: string | null = null) {
    super(`NWC: ${code}${walletCode ? ` (${walletCode})` : ''}`); // i18n-exempt: developer message; readers get the code
    this.name = 'NwcError';
    this.code = code;
    this.outcome = outcome;
    this.walletCode = walletCode;
  }
}

/** NIP-47's error codes, read as ours. Anything unlisted (`INTERNAL`, `OTHER`, a new one) is `wallet-failed`. */
const WALLET_CODES: Readonly<Record<string, NwcErrorCode>> = {
  RATE_LIMITED: 'wallet-rate-limited',
  NOT_IMPLEMENTED: 'wallet-not-supported',
  UNSUPPORTED_ENCRYPTION: 'wallet-not-supported',
  INSUFFICIENT_BALANCE: 'wallet-insufficient-balance',
  QUOTA_EXCEEDED: 'wallet-quota-exceeded',
  RESTRICTED: 'wallet-restricted',
  UNAUTHORIZED: 'wallet-unauthorized',
  PAYMENT_FAILED: 'wallet-payment-failed',
};

export function codeForWalletError(walletCode: unknown): NwcErrorCode {
  return (typeof walletCode === 'string' && WALLET_CODES[walletCode]) || 'wallet-failed';
}

/** True for an `NwcError` whose payment may have gone through. */
export function mayHavePaid(err: unknown): boolean {
  return err instanceof NwcError && err.outcome === 'unknown';
}
