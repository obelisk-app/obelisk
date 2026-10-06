import { describe, expect, it } from 'vitest';
import { shortHost } from '@/utils/relay-url/url-host';

describe('shortHost', () => {
  it('returns the host of a parseable URL, scheme and path dropped', () => {
    expect(shortHost('wss://relay.example.com/')).toBe('relay.example.com');
    expect(shortHost('https://sfu.obelisk.ar/info')).toBe('sfu.obelisk.ar');
  });

  it('keeps a non-default port, because that is part of what identifies the relay', () => {
    expect(shortHost('ws://localhost:7777')).toBe('localhost:7777');
  });

  it('returns the input untouched when it does not parse', () => {
    expect(shortHost('not a url')).toBe('not a url');
    expect(shortHost('')).toBe('');
  });
});
