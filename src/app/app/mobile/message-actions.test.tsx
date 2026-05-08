import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// PhoneShell imports the whole bridge surface. The two components under
// test (ChannelMessage, MessageActionsSheet) only consume a small slice of
// it, so the rest are stubbed wholesale so the module factory satisfies
// every named import.
vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {
    sendReaction: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    createGroup: vi.fn(),
    switchRelay: vi.fn(),
    removeRelay: vi.fn(),
  },
  useConfiguredRelays: () => ['wss://relay.obelisk.ar'],
  useIsLoggedIn: () => true,
  useIsRehydrating: () => false,
  useMyPubkey: () => null,
  useGroups: () => [],
  useChildrenByParent: () => ({}),
  useMessages: () => [],
  useLoadEarlier: () => ({ loadEarlier: vi.fn(), loading: false, reachedStart: true }),
  useDirectMessages: () => [],
  useUserMetadata: () => null,
  useAdmins: () => [],
  useAdminsByGroup: () => ({}),
  useMembers: () => [],
  useMyFollows: () => [],
  useReactions: () => ({}),
  useCurrentRelayUrl: () => 'wss://relay.obelisk.ar',
  useRelayAccess: () => ({ status: 'ok' }),
  useConnectionState: () => 'connected',
  useGroupMetadataEose: () => true,
  useActiveCallByChannel: () => ({}),
}));

vi.mock('@/lib/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/relay-branding', () => ({
  useRelayBranding: () => ({}),
  publishBranding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/channel-layout', () => ({
  useChannelLayout: () => ({ categories: [], channels: [], updatedAt: 0 }),
  useRelayOperatorPubkey: () => null,
  applyLayout: () => ({ categories: [], uncategorized: [] }),
  publishLayout: vi.fn().mockResolvedValue(undefined),
  newCategoryId: () => 'cat-test',
}));

vi.mock('@/components/BlossomImageInput', () => ({
  default: () => <div />,
}));

vi.mock('@/components/admin/RelayAdminPanel', () => ({
  default: () => <div />,
}));

// MessageContent does its own bridge lookups; stub it out so the test
// renders the raw text only.
vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

import { ChannelMessage, MessageActionsSheet } from './PhoneShell';

const sampleMsg = {
  id: 'msg-1',
  pubkey: 'a'.repeat(64),
  content: 'hello world',
  createdAt: Math.floor(Date.now() / 1000),
  kind: 9,
  replyToId: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('ChannelMessage kebab button', () => {
  it('renders the three-dots button on every message tile', () => {
    render(
      <ChannelMessage
        msg={sampleMsg}
        myPubkey={null}
        groupId="rly/group"
        reactions={[]}
        onLongPress={() => {}}
        onZap={() => {}}
        onAvatar={() => {}}
      />,
    );
    expect(screen.getByTestId('mobile-msg-more')).toBeTruthy();
  });

  it('calls onLongPress when the kebab button is tapped (no 500ms hold required)', () => {
    const onLongPress = vi.fn();
    render(
      <ChannelMessage
        msg={sampleMsg}
        myPubkey={null}
        groupId="rly/group"
        reactions={[]}
        onLongPress={onLongPress}
        onZap={() => {}}
        onAvatar={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId('mobile-msg-more'));
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});

describe('MessageActionsSheet Reply', () => {
  it('dispatches obelisk-mobile:reply with the msg id and closes the sheet', () => {
    const close = vi.fn();
    const onZap = vi.fn();
    const listener = vi.fn();
    window.addEventListener('obelisk-mobile:reply', listener as EventListener);

    try {
      render(
        <MessageActionsSheet
          msg={{ id: 'msg-7', pubkey: 'b'.repeat(64), content: 'hi' }}
          close={close}
          onZap={onZap}
        />,
      );
      fireEvent.click(screen.getByTestId('mobile-msg-actions-reply'));

      expect(listener).toHaveBeenCalledTimes(1);
      const ev = listener.mock.calls[0][0] as CustomEvent<{ msgId: string }>;
      expect(ev.detail.msgId).toBe('msg-7');
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('obelisk-mobile:reply', listener as EventListener);
    }
  });
});
