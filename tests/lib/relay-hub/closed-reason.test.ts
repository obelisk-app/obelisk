/**
 * The CLOSED reason classifier the registry's retry policy hangs on.
 */
import { describe, expect, it } from 'vitest';
import { classifyClosedReason, isQuotaReason } from '@/lib/relay-hub/closed-reason';
import * as registry from '@/lib/relay-hub/registry';

describe('classifyClosedReason', () => {
  it('reads auth-required: as auth and restricted: as restricted', () => {
    expect(classifyClosedReason('auth-required: sign in')).toBe('auth');
    expect(classifyClosedReason('restricted: not on the whitelist')).toBe('restricted');
  });

  it('reads nostr-tools\' attempted-and-failed wrapper by its inner reason', () => {
    const prefix = 'auth was required and attempted, but failed with:';
    expect(classifyClosedReason(`${prefix} auth-required: again`)).toBe('auth');
    expect(classifyClosedReason(`${prefix} restricted: no`)).toBe('restricted');
    expect(classifyClosedReason(`${prefix} timed out`)).toBe('auth');
  });

  it('reads rate limits and subscription caps as quota, anything else as other', () => {
    for (const reason of ['error: too many concurrent REQs', 'rate-limited: slow down', 'max subscriptions reached', 'Quota exceeded']) {
      expect(isQuotaReason(reason)).toBe(true);
      expect(classifyClosedReason(reason)).toBe('quota');
    }
    expect(classifyClosedReason('error: internal')).toBe('other');
    expect(classifyClosedReason('')).toBe('other');
  });

  it('is still reachable through the registry entry point', () => {
    expect(registry.classifyClosedReason).toBe(classifyClosedReason);
    expect(registry.isQuotaReason).toBe(isQuotaReason);
  });
});
