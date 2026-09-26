import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SOCIAL_RELAYS,
  SOCIAL_RELAY_MAX,
  SOCIAL_RELAY_PRESETS,
  WIDER_SOCIAL_RELAYS,
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

describe('the shipped relay sets', () => {
  it('has four defaults, all distinct', () => {
    expect(DEFAULT_SOCIAL_RELAYS).toHaveLength(4);
    expect(new Set(DEFAULT_SOCIAL_RELAYS).size).toBe(4);
  });

  it('does not default to relay.nostr.band', () => {
    // A search index, and one that does not reliably connect — measured at
    // an 8s hard timeout while every other relay here answered under a
    // second, and separately recorded erroring after ~10s by
    // `useNostrUserSearch`. A default set where one of four never answers is
    // how the header came to read 3/4 forever.
    expect(DEFAULT_SOCIAL_RELAYS).not.toContain('wss://relay.nostr.band');
  });

  it('still offers relay.nostr.band as a one-click preset', () => {
    // Demoted, not removed — it is the best search index available.
    expect(SOCIAL_RELAY_PRESETS.map((preset) => preset.url)).toContain('wss://relay.nostr.band');
  });

  it('offers every default as a preset, so a removed one can be put back', () => {
    const presets = SOCIAL_RELAY_PRESETS.map((preset) => preset.url);
    for (const relay of DEFAULT_SOCIAL_RELAYS) expect(presets).toContain(relay);
  });

  it('widens to a strictly larger set, without repeating a default', () => {
    // `WIDER_SOCIAL_RELAYS` spreads the defaults, so listing one again
    // afterwards would make the widen query ask the same relay twice.
    expect(new Set(WIDER_SOCIAL_RELAYS).size).toBe(WIDER_SOCIAL_RELAYS.length);
    expect(WIDER_SOCIAL_RELAYS.length).toBeGreaterThan(DEFAULT_SOCIAL_RELAYS.length);
    for (const relay of DEFAULT_SOCIAL_RELAYS) expect(WIDER_SOCIAL_RELAYS).toContain(relay);
  });

  it('ships only urls a browser will accept', () => {
    for (const relay of [...WIDER_SOCIAL_RELAYS, ...SOCIAL_RELAY_PRESETS.map((p) => p.url)]) {
      expect(normalizeRelayUrl(relay)).toBe(relay);
    }
  });
});
