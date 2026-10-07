import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { LocaleProvider } from '@tests/support/intl';

// Counts renders of the markdown pass, which is what the row's memo exists
// to spare. Stubbed so the test does not need the real bridge lookups.
const contentRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/chat/message/MessageContent', () => ({
  default: ({ content }: { content: string }) => {
    contentRenders.count += 1;
    return <span>{content}</span>;
  },
}));

const sendReaction = vi.fn();
const sendMessage = vi.fn(async () => {});
const setMuted = vi.fn(async () => {});
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
        setMuted: (...a: unknown[]) => setMuted(...(a as [])),
      },
    }),
  };
});

import { MessageRow } from '@/app/[locale]/app/panes/message/MessageRow';
import { __resetRecentEmojiSnapshotForTests, pushRecentEmoji } from '@/services/chat/picker/recent-emojis';
import { useMessageZapStore } from '@/store/chat/message-zap';
import { useToastStore } from '@/store/feedback/toast';

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
    setMuted.mockClear();
    useMessageZapStore.setState({ target: null });
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

describe('message row menu and toolbar actions', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRecentEmojiSnapshotForTests();
    sendReaction.mockClear();
    setMuted.mockClear();
    useMessageZapStore.setState({ target: null });
  });

  const openMenu = () => {
    fireEvent.click(screen.getByTestId('message-more'));
    return screen.getByTestId('message-menu');
  };

  it('the more button toggles the menu and marks itself expanded', () => {
    renderRow();
    expect(screen.getByTestId('message-more').getAttribute('aria-expanded')).toBe('false');
    openMenu();
    expect(screen.getByTestId('message-more').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByTestId('message-more'));
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('menu Reply replies and closes the menu', () => {
    const onReply = vi.fn();
    renderRow(onReply);
    openMenu();
    fireEvent.click(screen.getByTestId('message-menu-reply'));
    expect(onReply).toHaveBeenCalledWith(msg);
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('menu Forward opens the forward dialog and closes the menu', () => {
    renderRow();
    openMenu();
    fireEvent.click(screen.getByTestId('message-menu-forward'));
    expect(screen.queryByTestId('message-menu')).toBeNull();
    expect(screen.getByTestId('forward-target-there')).toBeInTheDocument();
  });

  it('a menu quick reaction reacts and closes everything', () => {
    renderRow();
    openMenu();
    fireEvent.click(screen.getAllByTestId('message-menu-quick-reaction')[0]);
    expect(sendReaction).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('menu Zap opens the zap dialog for the author and closes the menu', () => {
    renderRow();
    openMenu();
    fireEvent.click(screen.getByTestId('message-menu-zap'));
    expect(useMessageZapStore.getState().target).toMatchObject({ messageId: msg.id, recipientPubkey: msg.pubkey, groupId: 'here' });
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('menu Copy text copies, toasts and closes the menu', () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const before = useToastStore.getState().toasts.length;
    renderRow();
    openMenu();
    fireEvent.click(screen.getByTestId('message-menu-copy-text'));
    expect(writeText).toHaveBeenCalledWith('hello world');
    expect(useToastStore.getState().toasts.length).toBe(before + 1);
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('menu Mute mutes the author and closes the menu', () => {
    renderRow();
    const menu = openMenu();
    expect(within(menu).getByTestId('message-menu-mute').textContent).toContain('Mute user');
    fireEvent.click(screen.getByTestId('message-menu-mute'));
    expect(setMuted).toHaveBeenCalledWith(msg.pubkey, true);
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('toolbar Forward opens the forward dialog', () => {
    renderRow();
    fireEvent.click(screen.getByTestId('message-forward'));
    expect(screen.getByTestId('forward-target-there')).toBeInTheDocument();
  });

  it('a click on the message body pins the toolbar open, and a second unpins it', () => {
    renderRow();
    const bar = screen.getByTestId('message-toolbar');
    expect(bar.className).toContain('hidden');
    fireEvent.click(screen.getByText('hello world'));
    expect(bar.className).not.toContain('hidden');
    fireEvent.click(screen.getByText('hello world'));
    expect(bar.className).toContain('hidden');
  });

  it('a click on a button inside the body does not pin the toolbar', () => {
    renderRow();
    const bar = screen.getByTestId('message-toolbar');
    const body = screen.getByText('hello world');
    const inner = document.createElement('button');
    body.appendChild(inner);
    fireEvent.click(inner);
    expect(bar.className).toContain('hidden');
  });
});
