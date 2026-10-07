/**
 * The desktop channel tree: categories that fold, the rows and their
 * markers, publications with their thread rail, and the right-click menu.
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY, BRIDGE_MOCK_RELAY, groupFixture, messageFixture } from '@tests/support/mocks/nostr-bridge';
import { ChannelTree } from '@/app/[locale]/app/panes/sidebar/ChannelTree';
import { useChannelPrefsStore } from '@/store/chat/channel-prefs';
import { useReadStateStore } from '@/store/read-state';
import type { JsGroup } from '@/services/nostr-bridge';
import type { LaidOutSidebar } from '@/services/relay/channel-layout';
import type { View } from '@/utils/shell/desktop/view';

const OTHER = 'c'.repeat(64);
const general = groupFixture({ id: 'g1', name: 'general' });
const secret = groupFixture({ id: 'g2', name: 'secret', isPublic: false, isOpen: false });
const pubs = groupFixture({ id: 'f1', name: 'pubs', kind: 'forum' });
const thread = groupFixture({ id: 't1', name: 'a thread', parent: 'f1' });
const emptyThread = groupFixture({ id: 't2', name: 'aborted', parent: 'f1' });
const voice = groupFixture({ id: 'v1', name: 'hangout', kind: 'voice' });
const all: JsGroup[] = [general, secret, pubs, thread, emptyThread, voice];
const groupsById = Object.fromEntries(all.map((g) => [g.id, g]));
const childrenByParent = { f1: ['t1', 't2', 'gone'] };

function mount({
  laidOut = { categories: [{ id: 'c1', name: 'Talk', channelIds: ['g1', 'g2', 'f1', 'missing'] }], uncategorized: ['v1'] } as LaidOutSidebar,
  view = { kind: 'group', groupId: 'g1' } as View,
  distanceById = {} as Record<string, number | null>,
  seed = {},
} = {}) {
  const onSelect = vi.fn();
  const bridge = fakeBridge({
    groups: all,
    messagesByGroup: { t1: [messageFixture({ id: 'x', pubkey: OTHER, createdAt: 10 })] },
    ...seed,
  });
  renderWithBridge(
    <ChannelTree laidOut={laidOut} groupsById={groupsById} childrenByParent={childrenByParent} view={view} onSelect={onSelect} distanceById={distanceById} />,
    bridge,
  );
  return { onSelect, bridge };
}

beforeEach(() => {
  localStorage.clear();
  useChannelPrefsStore.getState().reset();
  useReadStateStore.setState({ groupCursors: {} });
});

describe('ChannelTree categories', () => {
  it('lists each category with its channel count, then the uncategorized ones under their own header', () => {
    mount();
    const talk = screen.getByRole('button', { name: /Talk/ });
    expect(talk.textContent).toBe('Talk4');
    expect(screen.getByRole('button', { name: /Uncategorized/ }).textContent).toBe('Uncategorized1');
    for (const id of ['g1', 'g2', 'f1', 'v1']) expect(screen.getByTestId(`channel-row-${id}`)).toBeInTheDocument();
    expect(screen.queryByTestId('channel-row-missing')).toBeNull();
  });

  it('folds and unfolds a category', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Talk/ }));
    expect(screen.queryByTestId('channel-row-g1')).toBeNull();
    expect(screen.getByTestId('channel-row-v1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Talk/ }));
    expect(screen.getByTestId('channel-row-g1')).toBeInTheDocument();
  });

  it('with no categories the channels stand on their own, without a header', () => {
    mount({ laidOut: { categories: [], uncategorized: ['g1', 'v1'] } });
    expect(screen.queryByRole('button', { name: /Uncategorized/ })).toBeNull();
    expect(screen.getByTestId('channel-row-g1')).toBeInTheDocument();
    expect(screen.getByTestId('channel-row-v1')).toBeInTheDocument();
  });
});

describe('ChannelTree rows', () => {
  it('selects a channel on click and highlights the open one', () => {
    const { onSelect } = mount();
    expect(screen.getByTestId('channel-row-g1').className).toContain('bg-lc-olive');
    expect(screen.getByTestId('channel-row-g2').className).not.toContain('bg-lc-olive');
    fireEvent.click(within(screen.getByTestId('channel-row-g2')).getByText('secret'));
    expect(onSelect).toHaveBeenCalledWith('g2');
  });

  it('marks private and closed channels', () => {
    mount();
    const row = screen.getByTestId('channel-row-g2');
    expect(within(row).getByTitle('Private').textContent).toBe('🔒');
    expect(within(row).getByTitle('Closed (invite only)').textContent).toBe('⊝');
    expect(within(screen.getByTestId('channel-row-g1')).queryByTitle('Private')).toBeNull();
  });

  it('colours a channel by its web-of-trust distance and says so on hover', () => {
    mount({ distanceById: { g1: 2, g2: null } });
    expect(within(screen.getByTestId('channel-row-g1')).getByText('general').getAttribute('title')).toBe('WoT 2°');
    expect(within(screen.getByTestId('channel-row-g2')).getByText('secret').getAttribute('title')).toBeNull();
  });

  it('dims and marks a muted channel', () => {
    useChannelPrefsStore.getState().setMutedUntil(BRIDGE_MOCK_RELAY, 'g2', Date.now() + 60_000);
    mount();
    const row = screen.getByTestId('channel-row-g2');
    expect(row.className).toContain('opacity-55');
    expect(within(row).getByLabelText('Muted')).toBeInTheDocument();
  });

  it('shows LIVE on a voice channel with a call in progress', () => {
    const now = Math.floor(Date.now() / 1000);
    mount({ seed: { activeCallByChannel: { v1: { hostPubkey: OTHER, status: 'open', participantCount: 2, expiresAt: now + 600, createdAt: now } } } });
    expect(within(screen.getByTestId('channel-row-v1')).getByTitle('Live call in progress').textContent).toBe('Live');
  });

  it('counts unread messages and mentions on a channel that is not open, but not on the open one', async () => {
    // Cursor 1 ms: every message counts as unread, with no clock involved.
    useReadStateStore.setState({ groupCursors: { g1: 1, g2: 1 } });
    const messages = Array.from({ length: 3 }, (_, i) => messageFixture({ id: `u${i}`, pubkey: OTHER, createdAt: 100 + i, mentions: i === 0 ? [BRIDGE_MOCK_PUBKEY] : [] }));
    mount({ seed: { messagesByGroup: { g1: messages, g2: messages } } });
    await act(async () => {});
    const row = screen.getByTestId('channel-row-g2');
    expect(within(row).getByLabelText('3 unread messages').textContent).toBe('3');
    expect(within(row).getByLabelText('1 mention or reply').textContent).toBe('1');
    expect(within(screen.getByTestId('channel-row-g1')).queryByLabelText(/unread/)).toBeNull();
  });

  it('opens the channel menu on right-click', () => {
    mount();
    expect(screen.queryByTestId('channel-context-menu')).toBeNull();
    fireEvent.contextMenu(screen.getByTestId('channel-row-g1'), { clientX: 10, clientY: 20 });
    expect(screen.getByTestId('channel-context-menu')).toBeInTheDocument();
  });
});

describe('ChannelTree publications', () => {
  it('shows the threads with messages on the rail, and folds them (remembered)', () => {
    mount();
    expect(screen.getByTestId('channel-row-t1').closest('.lc-thread-row')).not.toBeNull();
    expect(screen.queryByTestId('channel-row-t2')).toBeNull();
    const fold = screen.getByRole('button', { name: 'Collapse publications' });
    fireEvent.click(fold);
    expect(screen.queryByTestId('channel-row-t1')).toBeNull();
    expect(localStorage.getItem('obelisk-dex/forum-collapsed/f1')).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Expand publications' }));
    expect(screen.getByTestId('channel-row-t1')).toBeInTheDocument();
    expect(localStorage.getItem('obelisk-dex/forum-collapsed/f1')).toBeNull();
  });

  it('starts folded when the fold was saved', () => {
    localStorage.setItem('obelisk-dex/forum-collapsed/f1', '1');
    mount();
    expect(screen.queryByTestId('channel-row-t1')).toBeNull();
  });

  it('a thread appears once it has a message', () => {
    const { bridge } = mount();
    expect(screen.queryByTestId('channel-row-t2')).toBeNull();
    act(() => bridge.stores.messagesByGroup.set({
      t1: [messageFixture({ id: 'x', pubkey: OTHER, createdAt: 10 })],
      t2: [messageFixture({ id: 'y', pubkey: OTHER, createdAt: 11 })],
    }));
    expect(screen.getByTestId('channel-row-t2')).toBeInTheDocument();
  });
});
