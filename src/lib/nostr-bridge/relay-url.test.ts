import { describe, expect, it } from 'vitest';
import { normalizeRelayUrl, relayWebsiteUrl } from './relay-url';

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
