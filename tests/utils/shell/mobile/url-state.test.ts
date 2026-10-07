import { describe, expect, it } from 'vitest';
import { parseUrl, restoredNav, urlFor, type NavState } from '@/utils/shell/mobile/url-state';
import { initialNav } from '@/constants/shell/mobile';

const make = (over: Partial<NavState>): NavState => ({ ...initialNav, ...over });

describe('mobile url-state', () => {
  it('round-trips a channel + relay', () => {
    const nav = make({ screen: 'channel', groupId: 'abc123' });
    const url = urlFor(nav, 'wss://lacrypta-relay.obelisk.ar');
    const parsed = parseUrl(new URL('http://x' + url).search);
    expect(parsed.nav.screen).toBe('channel');
    expect(parsed.nav.groupId).toBe('abc123');
    expect(parsed.relay).toBe('wss://lacrypta-relay.obelisk.ar');
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
    const parsed = parseUrl('?c=g1;relay=lacrypta-relay.obelisk.ar');
    expect(parsed.nav.groupId).toBe('g1');
    expect(parsed.relay).toBe('wss://lacrypta-relay.obelisk.ar');
  });

  it('rejects unknown screen values', () => {
    const parsed = parseUrl('?s=evil');
    expect(parsed.nav.screen).toBe('server');
  });

  it('round-trips parentScreen so deep-link reloads keep cross-tab context', () => {
    const nav = make({ screen: 'profile-view', profilePubkey: 'pk', parentScreen: 'inbox' });
    const url = urlFor(nav, null);
    expect(url).toContain('pr=inbox');
    const parsed = parseUrl(new URL('http://x' + url).search);
    expect(parsed.nav.screen).toBe('profile-view');
    expect(parsed.nav.parentScreen).toBe('inbox');
  });

  it('omits the pr param when parentScreen is null', () => {
    const nav = make({ screen: 'channel', groupId: 'g' });
    expect(urlFor(nav, null)).not.toContain('pr=');
  });

  it('rejects unknown parentScreen values silently (parentScreen becomes null)', () => {
    const parsed = parseUrl('?u=pk&pr=evil');
    expect(parsed.nav.parentScreen).toBe(null);
  });
});

describe('restoredNav (history entries saved by older builds)', () => {
  const msg = { id: 'm1', pubkey: 'b'.repeat(64), content: 'gm' };

  it('turns a saved zap-modal sheet back into the screen it floated over', () => {
    const saved = { ...make({ groupId: 'g1', baseScreen: 'channel', msgContext: msg }), screen: 'zap-modal' } as unknown as NavState;
    expect(restoredNav(saved)).toMatchObject({ screen: 'channel', groupId: 'g1', baseScreen: null, msgContext: null });
  });

  it('falls back to the channel, or the server list, when the entry kept no base screen', () => {
    const inChannel = { ...make({ groupId: 'g1' }), screen: 'zap-modal' } as unknown as NavState;
    const bare = { ...make({}), screen: 'zap-modal' } as unknown as NavState;
    expect(restoredNav(inChannel).screen).toBe('channel');
    expect(restoredNav(bare).screen).toBe('server');
  });

  it('leaves every current screen as it was saved', () => {
    const sheet = make({ screen: 'msg-actions', groupId: 'g1', baseScreen: 'channel', msgContext: msg });
    expect(restoredNav(sheet)).toBe(sheet);
  });

  it('a URL cannot name the old zap sheet either', () => {
    expect(parseUrl('?s=zap-modal&c=g1').nav.screen).toBe('channel');
  });
});
