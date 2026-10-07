import { describe, expect, it } from 'vitest';
import { messageFixture } from '@tests/support/mocks/nostr-bridge';
import { channelPaneBody, indexMessagesById } from '@/utils/shell/panes/channel/channel-pane';

describe('channelPaneBody', () => {
  it('maps the channel kind to the pane body', () => {
    expect(channelPaneBody({ kind: 'forum' })).toBe('forum');
    expect(channelPaneBody({ kind: 'voice' })).toBe('voice');
    expect(channelPaneBody({ kind: 'voice-sfu' })).toBe('voice');
    expect(channelPaneBody({ kind: 'text' })).toBe('text');
  });

  it('an unknown channel gets the message list', () => {
    expect(channelPaneBody(null)).toBe('text');
    expect(channelPaneBody(undefined)).toBe('text');
  });
});

describe('indexMessagesById', () => {
  it('maps each message by id, the same objects', () => {
    const a = messageFixture({ id: 'a' });
    const b = messageFixture({ id: 'b' });
    const map = indexMessagesById([a, b]);
    expect(map.get('a')).toBe(a);
    expect(map.get('b')).toBe(b);
    expect(map.size).toBe(2);
  });
});
