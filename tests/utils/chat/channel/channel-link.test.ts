import { describe, expect, it } from 'vitest';
import { channelInviteLink, channelLink, messageLink } from '@/utils/chat/channel/channel-link';

describe('channelLink', () => {
  it('builds the deep link the app parses, with the relay host stripped of its scheme', () => {
    expect(channelLink('wss://lacrypta-relay.obelisk.ar', 'abc'))
      .toBe(`${window.location.origin}/app?relay=lacrypta-relay.obelisk.ar&c=abc`);
    expect(channelLink('ws://localhost:7777', 'abc')).toContain('relay=localhost%3A7777');
  });

  it('URL-encodes both parameters', () => {
    expect(channelLink('wss://relay.test/path?x=1', 'id/with spaces'))
      .toBe(`${window.location.origin}/app?relay=relay.test%2Fpath%3Fx%3D1&c=id%2Fwith%20spaces`);
  });
});

describe('channelInviteLink', () => {
  it('keeps only the channel and the relay host, dropping whatever else was in the URL', () => {
    expect(channelInviteLink('https://obelisk.ar/app?s=feed&m=x', 'g1', 'wss://relay.example/'))
      .toBe('https://obelisk.ar/app?c=g1&relay=relay.example');
  });

  it('leaves the relay out when there is none', () => {
    expect(channelInviteLink('https://obelisk.ar/app', 'g1', '')).toBe('https://obelisk.ar/app?c=g1');
  });
});

describe('messageLink', () => {
  it('points at the channel and the message on this relay, dropping other params', () => {
    expect(messageLink('https://obelisk.ar/app?s=feed', 'g1', 'm1', 'wss://relay.example'))
      .toBe('https://obelisk.ar/app?c=g1&m=m1&relay=relay.example');
  });

  it('omits the relay when there is none', () => {
    expect(messageLink('https://obelisk.ar/app', 'g1', 'm1', '')).toBe('https://obelisk.ar/app?c=g1&m=m1');
  });
});
