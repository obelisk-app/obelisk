import { describe, expect, it } from 'vitest';
import { channelLink } from '@/utils/channel-link';

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
