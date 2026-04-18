import { describe, it, expect, vi } from 'vitest';

vi.mock('@getalby/sdk', () => {
  class NWCClient { close() {} }
  class Nip47WalletError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  }
  class Nip47TimeoutError extends Error {}
  class Nip47NetworkError extends Error {}
  return { NWCClient, Nip47WalletError, Nip47TimeoutError, Nip47NetworkError };
});
vi.mock('./db', () => ({ prisma: { wallet: { findUnique: vi.fn() } } }));

import { classifyNwcError } from './nwc';
import { Nip47WalletError, Nip47TimeoutError, Nip47NetworkError } from '@getalby/sdk';

describe('classifyNwcError', () => {
  it('maps insufficient balance', () => {
    expect(classifyNwcError(new Nip47WalletError('INSUFFICIENT_BALANCE'))).toBe('insufficient_funds');
  });
  it('maps quota exceeded', () => {
    expect(classifyNwcError(new Nip47WalletError('QUOTA_EXCEEDED'))).toBe('quota_exceeded');
  });
  it('maps timeout', () => {
    expect(classifyNwcError(new Nip47TimeoutError('t'))).toBe('nwc_timeout');
  });
  it('maps relay error', () => {
    expect(classifyNwcError(new Nip47NetworkError('n'))).toBe('nwc_relay_error');
  });
  it('falls back to nwc_error for unknowns', () => {
    expect(classifyNwcError(new Error('weird'))).toBe('nwc_error');
  });
});
