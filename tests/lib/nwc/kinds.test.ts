import { describe, expect, it } from 'vitest';
import { NWC_KINDS, chooseEncryption, codeForWalletError, parseNwcInfo, type NwcErrorCode } from '@/lib/nwc';
import { KIND_NWC_INFO, KIND_NWC_REQUEST, KIND_NWC_RESPONSE } from '@/utils/nostr/nip-kinds';
import { isErrorCode } from '@/utils/errors/codes';

// Every code the mini-package can throw, typed so a new one fails to compile until it is listed here.
const NWC_CODES: Record<NwcErrorCode, true> = {
  'nwc-invalid-uri': true, 'nwc-unreachable': true, 'nwc-cannot-pay': true, 'wallet-timeout': true,
  'wallet-relay-failed': true, 'wallet-rate-limited': true, 'wallet-not-supported': true,
  'wallet-insufficient-balance': true, 'wallet-quota-exceeded': true, 'wallet-restricted': true,
  'wallet-unauthorized': true, 'wallet-payment-failed': true, 'wallet-failed': true,
};

describe('the NWC mini-package and the app agree', () => {
  it('on the event kinds', () => {
    expect(NWC_KINDS).toEqual({ info: KIND_NWC_INFO, request: KIND_NWC_REQUEST, response: KIND_NWC_RESPONSE });
  });

  it('on the error codes: every one the client throws is an app error code the UI can translate', () => {
    expect(Object.keys(NWC_CODES).filter((c) => !isErrorCode(c))).toEqual([]);
  });
});

describe('reading the wallet', () => {
  it('maps NIP-47 error codes to ours, and anything else to wallet-failed', () => {
    expect(codeForWalletError('INSUFFICIENT_BALANCE')).toBe('wallet-insufficient-balance');
    expect(codeForWalletError('QUOTA_EXCEEDED')).toBe('wallet-quota-exceeded');
    expect(codeForWalletError('UNAUTHORIZED')).toBe('wallet-unauthorized');
    expect(codeForWalletError('RATE_LIMITED')).toBe('wallet-rate-limited');
    expect(codeForWalletError('PAYMENT_FAILED')).toBe('wallet-payment-failed');
    expect(codeForWalletError('INTERNAL')).toBe('wallet-failed');
    expect(codeForWalletError('SOMETHING_NEW')).toBe('wallet-failed');
    expect(codeForWalletError(42)).toBe('wallet-failed');
  });

  it('uses NIP-44 when the info event offers it, NIP-04 when it names none', () => {
    expect(chooseEncryption(parseNwcInfo({ content: 'pay_invoice', tags: [['encryption', 'nip44_v2 nip04']] }))).toBe('nip44_v2');
    expect(chooseEncryption(parseNwcInfo({ content: 'pay_invoice', tags: [['encryption', 'nip04']] }))).toBe('nip04');
    expect(chooseEncryption(parseNwcInfo({ content: 'pay_invoice', tags: [] }))).toBe('nip04');
    expect(parseNwcInfo({ content: ' pay_invoice  get_balance\n', tags: [] }).methods).toEqual(['pay_invoice', 'get_balance']);
  });
});
