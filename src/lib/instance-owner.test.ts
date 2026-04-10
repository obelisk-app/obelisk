import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getInstanceOwnerPubkey, isInstanceOwner } from './instance-owner';

const ENV_KEY = 'INSTANCE_OWNER_PUBKEY';

describe('instance-owner helper', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_KEY];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = original;
  });

  it('returns null when env var is unset', () => {
    delete process.env[ENV_KEY];
    expect(getInstanceOwnerPubkey()).toBeNull();
    expect(isInstanceOwner('any-pk')).toBe(false);
  });

  it('returns null for empty/whitespace env var', () => {
    process.env[ENV_KEY] = '   ';
    expect(getInstanceOwnerPubkey()).toBeNull();
    expect(isInstanceOwner('any-pk')).toBe(false);
  });

  it('matches the configured pubkey exactly', () => {
    process.env[ENV_KEY] = 'abc123';
    expect(getInstanceOwnerPubkey()).toBe('abc123');
    expect(isInstanceOwner('abc123')).toBe(true);
    expect(isInstanceOwner('abc124')).toBe(false);
  });

  it('returns false for null/undefined input', () => {
    process.env[ENV_KEY] = 'abc123';
    expect(isInstanceOwner(null)).toBe(false);
    expect(isInstanceOwner(undefined)).toBe(false);
  });
});
