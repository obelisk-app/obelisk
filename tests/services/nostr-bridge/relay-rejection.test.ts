import { describe, expect, it } from 'vitest';
import {
  classifyAccessClose,
  isRelayQuotaOrRateLimit,
  isWhitelistRefusal,
  parseRelayRejection,
} from '@/services/nostr-bridge/relay-rejection';

describe('isRelayQuotaOrRateLimit', () => {
  it('matches the quota and rate-limit phrasings relays actually send', () => {
    for (const r of [
      'restricted: connection rate limit exceeded',
      'restricted: Subscription quota exceeded: 50/50',
      'ERROR: too many concurrent REQs',
      'rate-limited',
      'slow down',
    ]) expect(isRelayQuotaOrRateLimit(r), r).toBe(true);
  });

  it('does not match an allow-list refusal', () => {
    expect(isRelayQuotaOrRateLimit('restricted: not whitelisted')).toBe(false);
  });
});

describe('parseRelayRejection', () => {
  it('treats quota and rate-limit as transient: null, never restricted', () => {
    expect(parseRelayRejection('restricted: connection rate limit exceeded')).toBeNull();
  });

  it('maps auth-required phrasings to auth-required', () => {
    expect(parseRelayRejection('auth-required: please authenticate')).toBe('auth-required');
    expect(parseRelayRejection('AUTH_REQUIRED')).toBe('auth-required');
  });

  it('maps allow-list refusals to restricted', () => {
    expect(parseRelayRejection('restricted: not whitelisted')).toBe('restricted');
    expect(parseRelayRejection('blocked: pubkey not allowed')).toBe('restricted');
    expect(parseRelayRejection('forbidden')).toBe('restricted');
  });

  it('unwraps the nostr-tools AUTH-failed wrapper and classifies what is inside', () => {
    const prefix = 'auth was required and attempted, but failed with: ';
    expect(parseRelayRejection(`${prefix}restricted: not whitelisted`)).toBe('restricted');
    expect(parseRelayRejection(`${prefix}signer timed out`)).toBe('auth-required');
  });

  it('returns null for benign or unknown reasons so the caller keeps its state', () => {
    expect(parseRelayRejection('')).toBeNull();
    expect(parseRelayRejection('closed by client')).toBeNull();
  });
});

describe('classifyAccessClose', () => {
  it('reads a bare auth-required on an onauth sub as a whitelist refusal after AUTH', () => {
    expect(classifyAccessClose('auth-required: still no', true)).toBe('restricted');
  });

  it('reads the same reason without onauth as a plain auth requirement', () => {
    expect(classifyAccessClose('auth-required: still no', false)).toBe('auth-required');
  });

  it('otherwise defers to parseRelayRejection', () => {
    expect(classifyAccessClose('restricted: Subscription quota exceeded', true)).toBeNull();
    expect(classifyAccessClose('blocked', true)).toBe('restricted');
  });
});

describe('isWhitelistRefusal', () => {
  it('is only the relay-wide restricted + whitelist verdict', () => {
    expect(isWhitelistRefusal('restricted: pubkey not in whitelist')).toBe(true);
    expect(isWhitelistRefusal('restricted: not a member of this group')).toBe(false);
    expect(isWhitelistRefusal('blocked: whitelist')).toBe(false);
  });
});
