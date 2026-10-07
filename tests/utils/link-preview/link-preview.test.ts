import { describe, it, expect } from 'vitest';
import {
  decodeEntities,
  isBlockedAddress,
  isX,
  previewHost,
  readMeta,
  syndicationToken,
  tweetIdFrom,
  type LinkPreview,
} from '@/utils/link-preview/link-preview';

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

  // One case per range, each with its nearest public neighbour, so a wrong
  // prefix length fails on the neighbour and a missing range fails on the hit.
  it('refuses 192.0.0.0/24 (IETF protocol assignments)', () => {
    expect(isBlockedAddress('192.0.0.9')).toBe(true);
    expect(isBlockedAddress('192.0.1.9')).toBe(false);
  });

  it('refuses 192.0.2.0/24 (TEST-NET-1)', () => {
    expect(isBlockedAddress('192.0.2.1')).toBe(true);
    expect(isBlockedAddress('192.0.3.1')).toBe(false);
  });

  it('refuses 198.18.0.0/15 (benchmarking)', () => {
    expect(isBlockedAddress('198.18.0.1')).toBe(true);
    expect(isBlockedAddress('198.19.255.255')).toBe(true);
    expect(isBlockedAddress('198.17.255.255')).toBe(false);
    expect(isBlockedAddress('198.20.0.0')).toBe(false);
  });

  it('refuses 198.51.100.0/24 (TEST-NET-2)', () => {
    expect(isBlockedAddress('198.51.100.7')).toBe(true);
    expect(isBlockedAddress('198.51.101.7')).toBe(false);
  });

  it('refuses 203.0.113.0/24 (TEST-NET-3)', () => {
    expect(isBlockedAddress('203.0.113.9')).toBe(true);
    expect(isBlockedAddress('203.0.114.9')).toBe(false);
  });

  it('refuses the NAT64 prefix 64:ff9b::/96, which tunnels to any IPv4 host', () => {
    expect(isBlockedAddress('64:ff9b::7f00:1')).toBe(true); // 127.0.0.1 behind NAT64
    expect(isBlockedAddress('64:ff9b::808:808')).toBe(true); // even a public one: no tunnels
    expect(isBlockedAddress('64:ff9b:1::1')).toBe(true); // local-use NAT64
    expect(isBlockedAddress('64:ff9c::1')).toBe(false);
  });

  it('refuses the 6to4 prefix 2002::/16, which tunnels to any IPv4 host', () => {
    expect(isBlockedAddress('2002:7f00:1::1')).toBe(true);
    expect(isBlockedAddress('2002:808:808::1')).toBe(true);
    expect(isBlockedAddress('2003::1')).toBe(false);
  });

  it('reads the hex spelling of a v4-mapped address', () => {
    // `::ffff:7f00:1` is 127.0.0.1; the old slice(7) handed "7f00:1" to the
    // IPv4 check, which did not match and fell through to "allowed".
    expect(isBlockedAddress('::ffff:7f00:1')).toBe(true);
    expect(isBlockedAddress('::ffff:a9fe:a9fe')).toBe(true); // 169.254.169.254
    expect(isBlockedAddress('::ffff:c0a8:101')).toBe(true); // 192.168.1.1
    expect(isBlockedAddress('::ffff:808:808')).toBe(false); // 8.8.8.8
    expect(isBlockedAddress('::ffff:1.1.1.1')).toBe(false);
    expect(isBlockedAddress('::FFFF:127.0.0.1')).toBe(true);
  });

  it('refuses the other IPv6 ranges nothing public lives in', () => {
    expect(isBlockedAddress('::7f00:1')).toBe(true); // deprecated IPv4-compatible loopback
    expect(isBlockedAddress('::')).toBe(true);
    expect(isBlockedAddress('100::1')).toBe(true); // discard-only
    expect(isBlockedAddress('2001:db8::1')).toBe(true); // documentation
    expect(isBlockedAddress('ff02::1')).toBe(true); // multicast
    expect(isBlockedAddress('fe80::1%eth0')).toBe(true); // zone id dropped
    expect(isBlockedAddress('FE80::1')).toBe(true);
    expect(isBlockedAddress('fbff::1')).toBe(false); // just below fc00::/7
    expect(isBlockedAddress('2001:db9::1')).toBe(false); // just past documentation
  });

  it('fails closed on anything that is not an address', () => {
    expect(isBlockedAddress('localhost')).toBe(true);
    expect(isBlockedAddress('256.1.1.1')).toBe(true);
    expect(isBlockedAddress('1.2.3')).toBe(true);
    expect(isBlockedAddress('1:2:3:4:5:6:7:8:9')).toBe(true);
    expect(isBlockedAddress('::1::2')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
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
    expect(decodeEntities('a &mdash; b')).toBe('a \u2014 b');
    expect(decodeEntities('&#8212;')).toBe('\u2014');
    expect(decodeEntities('&#x2014;')).toBe('\u2014');
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

describe('previewHost', () => {
  const preview = (over: Partial<LinkPreview> = {}) =>
    ({ url: 'https://www.example.com/a', siteName: 'Example', title: 'T', ...over }) as LinkPreview;

  it('drops www., and falls back to the site name for a bad URL', () => {
    expect(previewHost(preview())).toBe('example.com');
    expect(previewHost(preview({ url: 'not a url' }))).toBe('Example');
  });
});
