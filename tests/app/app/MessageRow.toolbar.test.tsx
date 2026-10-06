import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { LocaleProvider } from '@/i18n/context';

// Counts renders of the markdown pass, which is what the row's memo exists
// to spare. Stubbed so the test does not need the real bridge lookups.
const contentRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => {
    contentRenders.count += 1;
    return <span>{content}</span>;
  },
}));

const sendReaction = vi.fn();
const sendMessage = vi.fn(async () => {});
vi.mock('@/services/nostr-bridge', async (orig) => {
  const actual = await orig<typeof import('@/services/nostr-bridge')>();
  const { bridgeOverrides, groupFixture, userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  return {
    ...actual,
    ...bridgeOverrides({
      useMyPubkey: () => 'b'.repeat(64),
      useUserMetadata: () => userMetadataFixture({ displayName: 'Ana' }),
      useCurrentRelayUrl: () => 'wss://relay.example',
      useMyMutes: () => [],
      useGroups: () => [
        groupFixture({ id: 'here', name: 'general', kind: 'text' }),
        groupFixture({ id: 'there', name: 'random', kind: 'text' }),
        groupFixture({ id: 'vc', name: 'voice', kind: 'voice' }),
      ],
      useGroupMemberInfo: () => [],
      useMessages: () => [],
      getBridgeImpl: () => null,
      nostrActions: {
        sendReaction: (...a: unknown[]) => sendReaction(...a),
        sendMessage: (...a: unknown[]) => sendMessage(...(a as [])),
        ensureUserMetadata: () => Promise.resolve(),
        removeReaction: vi.fn(),
        deleteGroupEvent: vi.fn(),
        setMuted: vi.fn(),
      },
    }),
  };
});

import { MessageRow } from '@/app/app/panes/MessageRow';
import { __resetRecentEmojiSnapshotForTests, pushRecentEmoji } from '@/services/recent-emojis';

const msg = {
  id: 'm'.repeat(64),
  pubkey: 'a'.repeat(64),
  content: 'hello world',
  createdAt: 1_700_000_000,
  kind: 9,
  replyToId: null,
  mentions: [],
};

function renderRow(onReply = vi.fn()) {
  render(
    <LocaleProvider initialLocale="en">
      <div className="group">
        <MessageRow msg={msg as never} parent={null} reactions={[]} zapTotal={null} groupId="here" grouped={false} isAdmin={false} onReply={onReply} />
      </div>
    </LocaleProvider>,
  );
}

describe('message hover toolbar', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRecentEmojiSnapshotForTests();
    sendReaction.mockClear();
    sendMessage.mockClear();
  });

  it('has 7 controls: 3 recent reactions, add-reaction, reply, forward, more', () => {
    pushRecentEmoji('🦀');
    renderRow();
    const bar = screen.getByTestId('message-toolbar');
    const buttons = within(bar).getAllByRole('button');
    expect(buttons).toHaveLength(7);
    const quick = within(bar).getAllByTestId('message-quick-reaction');
    expect(quick.map((b) => b.textContent)).toEqual(['🦀', '🔥', '⚡']);
    for (const id of ['message-add-reaction', 'message-reply', 'message-forward', 'message-more']) {
      expect(within(bar).getByTestId(id).querySelector('svg')).not.toBeNull();
    }
    // No bare "+" or "⋯" glyphs.
    expect(bar.textContent).not.toMatch(/[➕+⋯]/);
  });

  it('reacting from the bar sends the reaction and moves it to the front of recents', () => {
    renderRow();
    fireEvent.click(screen.getAllByTestId('message-quick-reaction')[1]);
    expect(sendReaction).toHaveBeenCalledWith(msg.id, msg.pubkey, '⚡', 'here', expect.anything());
    expect(screen.getAllByTestId('message-quick-reaction')[0].textContent).toBe('⚡');
  });

  it('reply button replies', () => {
    const onReply = vi.fn();
    renderRow(onReply);
    fireEvent.click(screen.getByTestId('message-reply'));
    expect(onReply).toHaveBeenCalledWith(msg);
  });

  it('⋯ opens a menu with 4 quick-reaction tiles, Add reaction, and icon rows', () => {
    renderRow();
    fireEvent.click(screen.getByTestId('message-more'));
    const menu = screen.getByTestId('message-menu');
    expect(within(menu).getAllByTestId('message-menu-quick-reaction')).toHaveLength(4);
    for (const id of ['message-menu-add-reaction', 'message-menu-reply', 'message-menu-forward', 'message-menu-zap', 'message-menu-copy-text', 'message-menu-copy-link', 'message-menu-mute']) {
      expect(within(menu).getByTestId(id).querySelector('svg')).not.toBeNull();
    }
    expect(menu.textContent).not.toMatch(/[😊🔗🔕🗑]/u);
  });

  it('Forward lists the other text channels and posts a quoted copy there', async () => {
    renderRow();
    fireEvent.click(screen.getByTestId('message-forward'));
    expect(screen.queryByTestId('forward-target-here')).toBeNull(); // not the source
    expect(screen.queryByTestId('forward-target-vc')).toBeNull(); // not voice
    fireEvent.click(screen.getByTestId('forward-target-there'));
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledWith('there', '**Forwarded** #general · Ana\n> hello world');
  });
});

describe('MessageRow memoization', () => {
  const STABLE_REACTIONS: never[] = [];
  const onReply = vi.fn();

  function Parent({ stableProps }: { stableProps: boolean }) {
    const [, force] = useState(0);
    return (
      <>
        <button data-testid="force" onClick={() => force((n) => n + 1)} />
        <MessageRow
          msg={msg as never}
          parent={null}
          reactions={stableProps ? STABLE_REACTIONS : []}
          zapTotal={null}
          groupId="here"
          grouped={false}
          isAdmin={false}
          onReply={stableProps ? onReply : () => {}}
        />
      </>
    );
  }

  it('does not re-run the markdown pass when the parent re-renders with the same props', () => {
    contentRenders.count = 0;
    render(<LocaleProvider initialLocale="en"><Parent stableProps /></LocaleProvider>);
    expect(contentRenders.count).toBe(1);
    fireEvent.click(screen.getByTestId('force'));
    fireEvent.click(screen.getByTestId('force'));
    expect(contentRenders.count).toBe(1);
  });

  it('re-renders when a caller hands it a fresh array or closure, which is why ChatPanel keeps them stable', () => {
    contentRenders.count = 0;
    render(<LocaleProvider initialLocale="en"><Parent stableProps={false} /></LocaleProvider>);
    fireEvent.click(screen.getByTestId('force'));
    expect(contentRenders.count).toBe(2);
  });
});
