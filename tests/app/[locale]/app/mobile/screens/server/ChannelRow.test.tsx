import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';
import { channelPrefKey, MUTED_FOREVER, useChannelPrefsStore } from '@/store/chat/channel-prefs';
import { ChannelRow } from '@/app/[locale]/app/mobile/screens/server/ChannelRow';
import { ForumThreadChildRow } from '@/app/[locale]/app/mobile/screens/server/ForumThreadChildRow';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/components/chat/channel/ChannelActionSheet', () => ({
  ChannelActionSheet: ({ target, onClose }: { target: { name: string; hasUnread: boolean }; onClose: () => void }) => (
    <button data-testid="channel-sheet" data-name={target.name} data-unread={String(target.hasUnread)} onClick={onClose} />
  ),
}));

const mount = (ui: React.ReactElement, seed: Parameters<typeof fakeBridge>[0] = {}) => renderWithBridge(ui, fakeBridge(seed));

beforeEach(() => useChannelPrefsStore.setState({ prefs: {} }));
afterEach(() => vi.useRealTimers());

describe('ChannelRow (phone)', () => {
  it('renders a text channel with a hash, its name and opens on tap', () => {
    const onClick = vi.fn();
    mount(<ChannelRow group={group({ id: 'g1', name: 'general' })} live={false} onClick={onClick} />);
    const row = screen.getByText('general').closest('button')!;
    expect(row.className.split(/\s+/)).toEqual(['ch-row']);
    expect(row.querySelector('.ch-icon')?.textContent).toBe('#');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalled();
  });

  it('marks the active row and an indented thread', () => {
    mount(<ChannelRow group={group({ id: 'g1', name: 'general' })} live={false} active indent onClick={vi.fn()} />);
    expect(screen.getByText('general').closest('button')!.className.split(/\s+/)).toEqual(['ch-row', 'active', 'ch-thread']);
  });

  it('shows a live voice channel without the long-press wrapper', () => {
    mount(<ChannelRow group={group({ id: 'v1', name: 'Lounge', kind: 'voice' })} live onClick={vi.fn()} />);
    expect(screen.queryByTestId('channel-row-menu-v1')).toBeNull();
    expect(document.querySelector('.voice-live-dot')).not.toBeNull();
    expect(screen.getByText('Lounge').closest('button')).toHaveClass('voice');
  });

  it('fades a muted channel and marks it', () => {
    useChannelPrefsStore.setState({ prefs: { [channelPrefKey(BRIDGE_MOCK_RELAY, 'g1')]: { mutedUntil: MUTED_FOREVER } } });
    mount(<ChannelRow group={group({ id: 'g1', name: 'general' })} live={false} onClick={vi.fn()} />);
    const row = screen.getByText('general').closest('button')!;
    expect(row.style.opacity).toBe('0.55');
    expect(row.textContent).toContain('🔕');
  });

  it('opens the channel menu on a long press and swallows the tap that ends it', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    mount(<ChannelRow group={group({ id: 'g1', name: 'general' })} live={false} onClick={onClick} />);
    const wrap = screen.getByTestId('channel-row-menu-g1');
    fireEvent.touchStart(wrap);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByTestId('channel-sheet')).toHaveAttribute('data-name', 'general');
    fireEvent.click(screen.getByText('general'));
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('general'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not open the menu when the touch ends early', () => {
    vi.useFakeTimers();
    mount(<ChannelRow group={group({ id: 'g1', name: 'general' })} live={false} onClick={vi.fn()} />);
    const wrap = screen.getByTestId('channel-row-menu-g1');
    fireEvent.touchStart(wrap);
    fireEvent.touchEnd(wrap);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByTestId('channel-sheet')).toBeNull();
  });

  it('opens the menu on right-click and closes it', () => {
    mount(<ChannelRow group={group({ id: 'g1' })} live={false} onClick={vi.fn()} />);
    fireEvent.contextMenu(screen.getByTestId('channel-row-menu-g1'));
    expect(screen.getByTestId('channel-sheet')).toHaveAttribute('data-name', 'g1');
    expect(screen.getByTestId('channel-sheet')).toHaveAttribute('data-unread', 'false');
    fireEvent.click(screen.getByTestId('channel-sheet'));
    expect(screen.queryByTestId('channel-sheet')).toBeNull();
  });

  it('splits an expandable forum into the row and a chevron that toggles', () => {
    const onToggle = vi.fn();
    const onClick = vi.fn();
    mount(<ChannelRow group={group({ id: 'f1', name: 'Board', kind: 'forum' })} live={false} onClick={onClick} expandable expanded onToggleExpand={onToggle} />);
    const chevron = document.querySelector('.ch-chevron-btn')!;
    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(chevron.querySelector('.ch-chevron')).toHaveClass('expanded');
    fireEvent.click(chevron);
    expect(onToggle).toHaveBeenCalled();
    fireEvent.click(document.querySelector('.ch-row-body')!);
    expect(onClick).toHaveBeenCalled();
    expect(chevron.closest('.ch-row-split')).not.toBeNull();
  });

  it('keeps a forum without threads as one button with a chevron', () => {
    mount(<ChannelRow group={group({ id: 'f1', name: 'Board', kind: 'forum' })} live={false} onClick={vi.fn()} />);
    expect(document.querySelector('.ch-chevron-btn')).toBeNull();
    expect(screen.getByText('Board').closest('button')!.querySelector('.ch-chevron')).not.toBeNull();
  });
});

describe('ForumThreadChildRow', () => {
  it('stays hidden until the thread has a message', () => {
    const { unmount } = mount(<ForumThreadChildRow group={group({ id: 't1', name: 'Thread' })} active={false} onClick={vi.fn()} />);
    expect(screen.queryByText('Thread')).toBeNull();
    unmount();
    mount(<ForumThreadChildRow group={group({ id: 't1', name: 'Thread' })} active={false} onClick={vi.fn()} />, { messagesByGroup: { t1: [message({ id: 'm' })] } });
    expect(screen.getByText('Thread').closest('button')).toHaveClass('ch-thread');
  });
});
