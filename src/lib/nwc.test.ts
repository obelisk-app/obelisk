import { describe, it, expect, vi } from 'vitest';

vi.mock('@getalby/sdk', () => {
  class NWCClient { close() {} }
  class Nip47Error extends Error {
    code: string;
    constructor(message: string, code: string) { super(message); this.code = code; }
  }
  class Nip47WalletError extends Nip47Error {}
  class Nip47TimeoutError extends Nip47Error {}
  class Nip47NetworkError extends Nip47Error {}
  return { NWCClient, Nip47Error, Nip47WalletError, Nip47TimeoutError, Nip47NetworkError };
});
vi.mock('./db', () => ({ prisma: { wallet: { findUnique: vi.fn() } } }));

import { classifyNwcError } from './nwc';
import { Nip47WalletError, Nip47TimeoutError, Nip47NetworkError } from '@getalby/sdk';

describe('classifyNwcError', () => {
  it('maps insufficient balance', () => {
    expect(classifyNwcError(new Nip47WalletError('insufficient', 'INSUFFICIENT_BALANCE'))).toBe('insufficient_funds');
  });
  it('maps quota exceeded', () => {
    expect(classifyNwcError(new Nip47WalletError('quota', 'QUOTA_EXCEEDED'))).toBe('quota_exceeded');
  });
  it('maps timeout', () => {
    expect(classifyNwcError(new Nip47TimeoutError('timed out', 'TIMEOUT'))).toBe('nwc_timeout');
  });
  it('maps relay error', () => {
    expect(classifyNwcError(new Nip47NetworkError('relay', 'NETWORK'))).toBe('nwc_relay_error');
  });
  it('falls back to nwc_error for unknowns', () => {
    expect(classifyNwcError(new Error('weird'))).toBe('nwc_error');
  });
});
