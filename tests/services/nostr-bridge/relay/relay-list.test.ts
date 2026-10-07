import { describe, expect, it } from 'vitest';
import {
  isImportableRelayUrl,
  normalizeConfiguredRelayUrl,
  uniqueRelayUrls,
  validateRelayUrl,
} from '@/services/nostr-bridge/relay/relay-list';
import { DEFAULT_RELAY, DEFAULT_RELAYS, LACRYPTA_RELAY, RETIRED_RELAY } from '@/constants/nostr-bridge/relay';

describe('isImportableRelayUrl', () => {
  it('accepts a public wss relay, with or without a path', () => {
    expect(isImportableRelayUrl('wss://relay.damus.io')).toBe(true);
    expect(isImportableRelayUrl('wss://example.com/relay')).toBe(true);
  });

  it('rejects plaintext ws, non-URLs and onion hosts', () => {
    expect(isImportableRelayUrl('ws://relay.damus.io')).toBe(false);
    expect(isImportableRelayUrl('not a url')).toBe(false);
    expect(isImportableRelayUrl('wss://abc.onion')).toBe(false);
  });

  it('rejects loopback, private and link-local hosts', () => {
    for (const host of [
      'localhost', 'dev.localhost', 'relay.local', 'host.docker.internal',
      '127.0.0.1', '10.1.2.3', '192.168.0.1', '169.254.1.1', '172.16.0.1', '172.31.9.9', '0.0.0.0', '[::1]',
    ]) expect(isImportableRelayUrl(`wss://${host}`), host).toBe(false);
    expect(isImportableRelayUrl('wss://172.32.0.1')).toBe(true);
  });

  it('currently lets IPv6 link-local through: URL.hostname keeps the brackets, so startsWith("fe80:") never matches', () => {
    // Pinned as-is during the extraction (behaviour-preserving). The fix is
    // to strip the brackets before the fe80 check; see the round 4 report.
    expect(new URL('wss://[fe80::1]').hostname).toBe('[fe80::1]');
    expect(isImportableRelayUrl('wss://[fe80::1]')).toBe(true);
  });
});

describe('validateRelayUrl', () => {
  it('accepts ws and wss with a dotted host, an IP or localhost', () => {
    for (const u of ['wss://relay.example', 'ws://localhost:7777', 'ws://127.0.0.1:7777']) {
      expect(() => validateRelayUrl(u), u).not.toThrow();
    }
  });

  it('rejects other schemes, single-label hosts and garbage', () => {
    expect(() => validateRelayUrl('https://relay.example')).toThrow(/ws:\/\/ or wss:\/\//);
    expect(() => validateRelayUrl('wss://pindonga')).toThrow(/single-label/);
    expect(() => validateRelayUrl('nope')).toThrow(/not a valid URL/);
  });
});

describe('normalizeConfiguredRelayUrl', () => {
  it('redirects the retired relay to its replacement and normalizes everything else', () => {
    expect(normalizeConfiguredRelayUrl(RETIRED_RELAY)).toBe(LACRYPTA_RELAY);
    expect(normalizeConfiguredRelayUrl(`${RETIRED_RELAY}/`)).toBe(LACRYPTA_RELAY);
    expect(normalizeConfiguredRelayUrl('wss://Relay.Example/')).toBe('wss://relay.example');
  });
});

describe('uniqueRelayUrls', () => {
  it('dedupes by normalized form, drops invalid and non-importable entries, keeps order', () => {
    expect(uniqueRelayUrls([
      'wss://a.example/',
      'wss://A.example',
      'ws://a.example',
      'wss://localhost',
      'garbage',
      'wss://b.example',
    ])).toEqual(['wss://a.example', 'wss://b.example']);
  });

  it('folds the retired relay into the replacement so the pair dedupes', () => {
    expect(uniqueRelayUrls([RETIRED_RELAY, LACRYPTA_RELAY])).toEqual([LACRYPTA_RELAY]);
  });

  it('the defaults are themselves importable and unique', () => {
    expect(DEFAULT_RELAYS).toEqual([DEFAULT_RELAY, LACRYPTA_RELAY]);
    expect(uniqueRelayUrls(DEFAULT_RELAYS)).toEqual(DEFAULT_RELAYS);
  });
});
