import { describe, expect, it } from 'vitest';
import { initialNav, parseUrl, urlFor, type NavState } from './url-state';

const make = (over: Partial<NavState>): NavState => ({ ...initialNav, ...over });

describe('mobile url-state', () => {
  it('round-trips a channel + relay', () => {
    const nav = make({ screen: 'channel', groupId: 'abc123' });
    const url = urlFor(nav, 'wss://relay.obelisk.ar');
    const parsed = parseUrl(new URL('http://x' + url).search);
    expect(parsed.nav.screen).toBe('channel');
    expect(parsed.nav.groupId).toBe('abc123');
    expect(parsed.relay).toBe('wss://relay.obelisk.ar');
  });

  it('omits params for the default server screen', () => {
    expect(urlFor(initialNav, null)).toBe('/app');
  });

  it('preserves dm-thread peer', () => {
    const nav = make({ screen: 'dm-thread', dmPeer: 'pubkeyhex' });
    const url = urlFor(nav, null);
    expect(url).toContain('p=pubkeyhex');
    expect(url).toContain('s=dm-thread');
    const parsed = parseUrl(new URL('http://x' + url).search);
    expect(parsed.nav.screen).toBe('dm-thread');
    expect(parsed.nav.dmPeer).toBe('pubkeyhex');
  });

  it('infers screen from c when s is absent', () => {
    const parsed = parseUrl('?c=group1');
    expect(parsed.nav.screen).toBe('channel');
    expect(parsed.nav.groupId).toBe('group1');
  });

  it('accepts ; as a param separator', () => {
    const parsed = parseUrl('?c=g1;relay=relay.obelisk.ar');
    expect(parsed.nav.groupId).toBe('g1');
    expect(parsed.relay).toBe('wss://relay.obelisk.ar');
  });

  it('rejects unknown screen values', () => {
    const parsed = parseUrl('?s=evil');
    expect(parsed.nav.screen).toBe('server');
  });
});
