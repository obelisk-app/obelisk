import { describe, expect, it } from 'vitest';
import { colorFor, letterFor } from '@/utils/relay-url/relay-tile-style';
import { relayShareLink } from '@/utils/relay-url/relay-share-link';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';

describe('letterFor', () => {
  it('uses the registrable name, not a subdomain', () => {
    expect(letterFor('relay.damus.io')).toBe('D');
    expect(letterFor('nos.lol')).toBe('N');
  });

  it('falls back to the only segment, then to "?"', () => {
    expect(letterFor('localhost')).toBe('L');
    expect(letterFor('')).toBe('?');
  });
});

describe('colorFor', () => {
  it('is stable for a host and differs between hosts', () => {
    expect(colorFor('nos.lol')).toBe(colorFor('nos.lol'));
    expect(colorFor('nos.lol')).not.toBe(colorFor('relay.damus.io'));
    expect(colorFor('nos.lol')).toMatch(/^hsl\(\d+ 60% 45%\)$/);
  });
});

describe('relayShareLink', () => {
  it('builds an /r/<code> link that decodes back to the relay', () => {
    const link = relayShareLink('https://obelisk.ar', 'wss://relay.example');
    expect(link.startsWith('https://obelisk.ar/r/')).toBe(true);
    expect(decodeRelayShareCode(link.slice('https://obelisk.ar/r/'.length))).toBe('wss://relay.example');
  });
});
