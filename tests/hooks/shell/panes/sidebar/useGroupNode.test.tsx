import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY, groupFixture } from '@tests/support/mocks/nostr-bridge';
import { useGroupNode } from '@/hooks/shell/panes/sidebar/useGroupNode';
import { useChannelPrefsStore } from '@/store/chat/channel-prefs';
import type { JsGroup } from '@/services/nostr-bridge';
import type { View } from '@/utils/shell/desktop/view';

const forum = groupFixture({ id: 'f1', name: 'pubs', kind: 'forum' });
const thread = groupFixture({ id: 't1', parent: 'f1' });
const groupsById: Record<string, JsGroup> = { f1: forum, t1: thread };

function setup(group: JsGroup, { view = { kind: 'group', groupId: 'other' } as View, seed = {}, distanceById = undefined as Record<string, number | null> | undefined } = {}) {
  return renderHook(
    () => useGroupNode({ group, view, depth: 1, childrenByParent: { f1: ['t1', 'gone'] }, groupsById, distanceById }),
    { wrapper: bridgeWrapper(fakeBridge(seed)) },
  );
}

beforeEach(() => {
  localStorage.clear();
  useChannelPrefsStore.getState().reset();
});

describe('useGroupNode', () => {
  it('knows when it is the open channel and lists its known children', () => {
    const { result } = setup(forum, { view: { kind: 'group', groupId: 'f1' } });
    expect(result.current.active).toBe(true);
    expect(result.current.children).toEqual([thread]);
    expect(result.current.isCollapsible).toBe(true);
    expect(result.current.label).toBe('pubs');
    expect(result.current.indent).toBe('0.5rem');
  });

  it('a channel without children does not fold', () => {
    expect(setup(thread).result.current.isCollapsible).toBe(false);
  });

  it('folds a publication and saves the fold', () => {
    const { result } = setup(forum);
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem('obelisk-dex/forum-collapsed/f1')).toBe('1');
  });

  it('a muted channel is dimmed unless it is open', () => {
    useChannelPrefsStore.getState().setMutedUntil(BRIDGE_MOCK_RELAY, 'f1', Date.now() + 60_000);
    expect(setup(forum).result.current.dimmed).toBe(true);
    expect(setup(forum, { view: { kind: 'group', groupId: 'f1' } }).result.current.dimmed).toBe(false);
  });

  it('the WoT colour and title come from the distance map', () => {
    const { result } = setup(forum, { distanceById: { f1: 1 } });
    expect(result.current.wotTitle).toBe('WoT 1°');
    expect(result.current.wotClass).not.toBe('');
    expect(setup(forum).result.current.wotClass).toBe('');
  });

  it('a right-click opens the menu at the pointer with the channel as target', () => {
    const { result } = setup(forum);
    let prevented = false;
    act(() => result.current.openMenu({ clientX: 5, clientY: 6, preventDefault: () => { prevented = true; } } as never));
    expect(prevented).toBe(true);
    expect(result.current.menuAt).toEqual({ x: 5, y: 6 });
    expect(result.current.menuTarget).toEqual({ relay: BRIDGE_MOCK_RELAY, channelId: 'f1', name: 'pubs', hasUnread: false });
    act(() => result.current.closeMenu());
    expect(result.current.menuAt).toBeNull();
  });

  it('with no relay there is no menu, and the browser keeps its own', () => {
    const { result } = setup(forum, { seed: { currentRelayUrl: '' } });
    let prevented = false;
    act(() => result.current.openMenu({ clientX: 5, clientY: 6, preventDefault: () => { prevented = true; } } as never));
    expect(prevented).toBe(false);
    expect(result.current.menuAt).toBeNull();
    expect(result.current.menuTarget).toBeNull();
  });
});
