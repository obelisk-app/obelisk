import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOCIAL_RELAYS,
  SOCIAL_RELAY_MAX,
  invalidRelayIndexes,
  normalizeRelayUrl,
  normalizeSocialRelays,
  socialRelayKey,
} from './relays';

describe('normalizeRelayUrl', () => {
  it('accepts a public wss relay and strips a bare trailing slash', () => {
    expect(normalizeRelayUrl('wss://relay.example/')).toBe('wss://relay.example');
  });

  it('rejects non-wss, credentialed, and non-public hosts', () => {
    // isPublicWssUrl guards against CSP violations and LAN-pointed sockets.
    expect(normalizeRelayUrl('ws://relay.example')).toBeNull();
    expect(normalizeRelayUrl('https://relay.example')).toBeNull();
    expect(normalizeRelayUrl('wss://user:pw@relay.example')).toBeNull();
    expect(normalizeRelayUrl('wss://localhost:7777')).toBeNull();
    expect(normalizeRelayUrl('wss://127.0.0.1')).toBeNull();
    expect(normalizeRelayUrl('not a url')).toBeNull();
    expect(normalizeRelayUrl(42)).toBeNull();
  });
});

describe('normalizeSocialRelays', () => {
  it('keeps the good entries instead of rejecting the whole list', () => {
    // The old exactly-3 rule threw away everything when one entry was bad.
    expect(normalizeSocialRelays([
      'wss://a.example',
      'ws://bad.example',
      'wss://b.example',
    ])).toEqual(['wss://a.example', 'wss://b.example']);
  });

  it('accepts any count between 1 and the max', () => {
    expect(normalizeSocialRelays(['wss://a.example'])).toEqual(['wss://a.example']);
    const many = Array.from({ length: 12 }, (_, i) => `wss://r${i}.example`);
    expect(normalizeSocialRelays(many)).toHaveLength(SOCIAL_RELAY_MAX);
  });

  it('dedupes entries that differ only by trailing slash', () => {
    expect(normalizeSocialRelays(['wss://a.example', 'wss://a.example/']))
      .toEqual(['wss://a.example']);
  });

  it('falls back to defaults when nothing survives', () => {
    expect(normalizeSocialRelays([])).toEqual([...DEFAULT_SOCIAL_RELAYS]);
    expect(normalizeSocialRelays(['ws://bad'])).toEqual([...DEFAULT_SOCIAL_RELAYS]);
    expect(normalizeSocialRelays(undefined)).toEqual([...DEFAULT_SOCIAL_RELAYS]);
  });

  it('migrates the legacy exactly-three preference losslessly', () => {
    const legacy = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
    expect(normalizeSocialRelays(legacy)).toEqual(legacy);
  });
});

describe('invalidRelayIndexes', () => {
  it('flags only non-empty invalid rows, so a blank row isn\'t an error', () => {
    expect(invalidRelayIndexes(['wss://a.example', '', 'nope'])).toEqual([2]);
  });
});

describe('socialRelayKey', () => {
  it('is order-independent so member order does not split the cache', () => {
    expect(socialRelayKey(['wss://b.example', 'wss://a.example']))
      .toBe(socialRelayKey(['wss://a.example', 'wss://b.example']));
  });

  it('differs between distinct relay sets', () => {
    // Notes from one set must never be painted for another.
    expect(socialRelayKey(['wss://a.example']))
      .not.toBe(socialRelayKey(['wss://b.example']));
  });
});
