import { describe, it, expect } from 'vitest';
import {
  decodeEntities,
  isBlockedAddress,
  isX,
  readMeta,
  syndicationToken,
  tweetIdFrom,
} from './link-preview';

describe('isBlockedAddress', () => {
  it('refuses the addresses an SSRF actually targets', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true); // cloud metadata
    expect(isBlockedAddress('127.0.0.1')).toBe(true); // the relay admin API
    expect(isBlockedAddress('10.0.0.5')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('100.64.0.1')).toBe(true); // CGNAT
    expect(isBlockedAddress('0.0.0.0')).toBe(true);
    expect(isBlockedAddress('224.0.0.1')).toBe(true);
  });

  it('allows ordinary public addresses', () => {
    expect(isBlockedAddress('1.1.1.1')).toBe(false);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('172.32.0.1')).toBe(false); // just past the private range
    expect(isBlockedAddress('172.15.255.255')).toBe(false); // just before it
    expect(isBlockedAddress('100.63.255.255')).toBe(false);
  });

  it('is not fooled by IPv6 spellings of a private address', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('fd00::1')).toBe(true);
    // v4-mapped: the same loopback wearing a different hat
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:169.254.169.254')).toBe(true);
    expect(isBlockedAddress('2606:4700:4700::1111')).toBe(false);
  });
});

describe('readMeta', () => {
  it('reads property= and name=, in either attribute order', () => {
    expect(readMeta('<meta property="og:title" content="Hello">', 'og:title')).toBe('Hello');
    expect(readMeta('<meta name="twitter:title" content="Hi">', 'twitter:title')).toBe('Hi');
    expect(readMeta('<meta content="Reversed" property="og:title">', 'og:title')).toBe('Reversed');
  });

  it('decodes entities and ignores a missing key', () => {
    expect(readMeta('<meta property="og:title" content="A &amp; B">', 'og:title')).toBe('A & B');
    expect(readMeta('<meta property="og:title" content="x">', 'og:image')).toBeUndefined();
  });
});

describe('decodeEntities', () => {
  it('handles named, numeric and hex entities', () => {
    expect(decodeEntities('a &mdash; b')).toBe('a — b');
    expect(decodeEntities('&#8212;')).toBe('—');
    expect(decodeEntities('&#x2014;')).toBe('—');
  });

  it('decodes &amp; last so a double-escaped entity stays literal', () => {
    expect(decodeEntities('&amp;mdash;')).toBe('&mdash;');
  });
});

describe('X helpers', () => {
  it('recognises the hosts X actually serves', () => {
    expect(isX('x.com')).toBe(true);
    expect(isX('www.x.com')).toBe(true);
    expect(isX('twitter.com')).toBe(true);
    expect(isX('mobile.twitter.com')).toBe(true);
    expect(isX('notx.com')).toBe(false);
    // Must not match a lookalike that merely ends in the same string.
    expect(isX('evilx.com')).toBe(false);
  });

  it('pulls the post id out of a status URL', () => {
    expect(tweetIdFrom(new URL('https://x.com/jack/status/20'))).toBe('20');
    expect(tweetIdFrom(new URL('https://twitter.com/a/statuses/1349129669258448897')))
      .toBe('1349129669258448897');
    expect(tweetIdFrom(new URL('https://x.com/jack'))).toBeNull();
  });

  it('derives the same token X\'s own widget uses', () => {
    // Verified against the live endpoint for this id.
    expect(syndicationToken('1349129669258448897')).toBe('39qeyy97t9x');
  });
});
