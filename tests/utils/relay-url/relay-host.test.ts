import { describe, expect, it } from 'vitest';
import { relayHostLabel } from '@/utils/relay-url/relay-host';

describe('relayHostLabel', () => {
  it('is the host of an address that parses, port included', () => {
    expect(relayHostLabel('wss://relay.example/')).toBe('relay.example');
    expect(relayHostLabel('wss://relay.example:7777/nostr')).toBe('relay.example:7777');
  });

  it('tidies one that does not: no scheme, no trailing slashes', () => {
    expect(relayHostLabel('not a url///')).toBe('not a url');
    expect(relayHostLabel('wss://bad host//')).toBe('bad host');
  });
});
