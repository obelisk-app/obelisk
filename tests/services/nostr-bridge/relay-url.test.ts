import { describe, expect, it } from 'vitest';
import { normalizeURL } from 'nostr-tools/utils';
import { normalizeRelayUrl, relayWebsiteUrl } from '@/services/nostr-bridge/relay-url';

describe('normalizeRelayUrl', () => {
  it('folds casing, trailing slashes and default paths', () => {
    expect(normalizeRelayUrl('wss://Relay.com/')).toBe(normalizeRelayUrl('wss://relay.com'));
  });

  it('keeps a meaningful path', () => {
    expect(normalizeRelayUrl('wss://example.com/relay/')).toBe('wss://example.com/relay');
  });

  it('falls back to trim + lowercase for unparseable input', () => {
    expect(normalizeRelayUrl('  WSS://Bad Url/  ')).toBe('wss://bad url');
  });

  /**
   * This function is the one relay-equality key for the whole app (cache
   * prefixes, relayAccess maps, the rail's active check, the background
   * watch). Two other copies existed with different answers on exactly the
   * inputs below; these cases pin the semantics the copies must adopt when
   * they are pointed here.
   */
  describe('the cases where the three copies disagreed', () => {
    it('strips every trailing slash, not just one', () => {
      // social/relays.ts stripped one: `wss://relay.com//` became `wss://relay.com/`.
      expect(normalizeRelayUrl('wss://relay.com//')).toBe('wss://relay.com');
      expect(normalizeRelayUrl('wss://relay.com/path//')).toBe('wss://relay.com/path');
    });

    it('drops the default port, so :443 and no port are the same relay', () => {
      // PhoneShell's string-only copy kept `:443` and compared unequal.
      expect(normalizeRelayUrl('wss://relay.com:443')).toBe('wss://relay.com');
      expect(normalizeRelayUrl('ws://relay.com:80')).toBe('ws://relay.com');
      expect(normalizeRelayUrl('wss://relay.com:7777')).toBe('wss://relay.com:7777');
    });

    it('folds host case but keeps path case (paths are case-sensitive)', () => {
      // PhoneShell lowercased the whole string, so `/Path` and `/path` collided.
      expect(normalizeRelayUrl('wss://RELAY.com/Path')).toBe('wss://relay.com/Path');
      expect(normalizeRelayUrl('wss://relay.com/Path')).not.toBe(normalizeRelayUrl('wss://relay.com/path'));
    });

    it('keeps ws:// and wss:// distinct (they are different sockets)', () => {
      expect(normalizeRelayUrl('ws://relay.com')).toBe('ws://relay.com');
      expect(normalizeRelayUrl('ws://relay.com')).not.toBe(normalizeRelayUrl('wss://relay.com'));
    });

    it('drops the fragment (never sent to the relay) and keeps the query as given', () => {
      // PhoneShell and social/relays.ts kept `#x`, so the same relay compared unequal.
      expect(normalizeRelayUrl('wss://relay.com#x')).toBe('wss://relay.com');
      expect(normalizeRelayUrl('wss://relay.com?b=1&a=2')).toBe('wss://relay.com?b=1&a=2');
    });

    it('trims surrounding whitespace before anything else', () => {
      // PhoneShell did not trim: `  wss://relay.com  ` compared unequal to itself pasted cleanly.
      expect(normalizeRelayUrl('  wss://relay.com  ')).toBe('wss://relay.com');
    });

    it('returns the empty string for empty input (social/relays.ts returned null)', () => {
      expect(normalizeRelayUrl('')).toBe('');
      expect(normalizeRelayUrl('   ')).toBe('');
    });
  });

  /**
   * The RelayHub (round 2 design) keys its socket table on nostr-tools'
   * `normalizeURL`. The bridge keeps keying its own maps on this function,
   * so the two must agree wherever a relay URL can actually appear, or the
   * bridge has to re-normalize every URL the hub hands back. These cases
   * record where they agree today and where they do not.
   */
  describe('relationship to nostr-tools normalizeURL (the RelayHub key)', () => {
    const bridgeKeyOf = (u: string) => normalizeRelayUrl(normalizeURL(u));

    it('re-normalizing a hub key yields the bridge key for every configured-relay shape', () => {
      for (const u of [
        'wss://public.obelisk.ar',
        'wss://public.obelisk.ar/',
        'wss://Relay.Example/',
        'wss://relay.example/Path/',
        'wss://relay.example:443',
        'wss://relay.example:7777',
        'ws://localhost:7777',
      ]) {
        expect(bridgeKeyOf(u)).toBe(normalizeRelayUrl(u));
      }
    });

    it('differs on the bare root: nostr-tools keeps the trailing slash, the bridge drops it', () => {
      // A hub status for `wss://x/` must be looked up as `wss://x` on the bridge side.
      expect(normalizeURL('wss://relay.example')).toBe('wss://relay.example/');
      expect(normalizeRelayUrl('wss://relay.example')).toBe('wss://relay.example');
    });

    it('differs on scheme-less input: nostr-tools assumes wss://, the bridge does not', () => {
      expect(normalizeURL('relay.example')).toBe('wss://relay.example/');
      expect(normalizeRelayUrl('relay.example')).toBe('relay.example');
    });

    it('differs on duplicate interior slashes and query order, which nostr-tools canonicalizes', () => {
      expect(normalizeURL('wss://relay.example/a//b/')).toBe('wss://relay.example/a/b');
      expect(normalizeRelayUrl('wss://relay.example/a//b/')).toBe('wss://relay.example/a//b');
      expect(normalizeURL('wss://relay.example?b=1&a=2')).toBe('wss://relay.example/?a=2&b=1');
      expect(normalizeRelayUrl('wss://relay.example?b=1&a=2')).toBe('wss://relay.example?b=1&a=2');
    });
  });
});

describe('relayWebsiteUrl', () => {
  it('swaps wss for https, so the relay name can link to its own page', () => {
    expect(relayWebsiteUrl('wss://public.obelisk.ar')).toBe('https://public.obelisk.ar');
  });

  it('keeps a path, which is part of some relay endpoints', () => {
    expect(relayWebsiteUrl('wss://example.com/relay')).toBe('https://example.com/relay');
  });

  it('maps plaintext ws to http rather than promoting it', () => {
    // A local dev relay on ws:// has no https listener to send people to.
    expect(relayWebsiteUrl('ws://localhost:7777')).toBe('http://localhost:7777');
  });

  it('refuses anything that is not a relay URL', () => {
    // The name renders unlinked rather than pointing somewhere arbitrary.
    expect(relayWebsiteUrl('https://example.com')).toBeNull();
    expect(relayWebsiteUrl('not a url')).toBeNull();
    expect(relayWebsiteUrl('')).toBeNull();
  });

  it('drops a bare trailing slash', () => {
    expect(relayWebsiteUrl('wss://example.com/')).toBe('https://example.com');
  });
});
