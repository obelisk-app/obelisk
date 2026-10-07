import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';
import { useServerScreen } from '@/hooks/shell/mobile/screens/server/useServerScreen';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/hooks/relay/operator/useRelayOperatorData', () => ({
  useRelayOperatorData: () => ({
    operatorPubkey: null, isRelayOperator: false,
    layout: { categories: [], channels: [], updatedAt: 0 },
    branding: { name: 'Brand', icon: 'brand.png', banner: '', description: '', updatedAt: 0 },
    emojiSet: { title: '', emojis: [], updatedAt: 0 },
    relayRoles: { roles: [], assignments: [], updatedAt: 0 },
  }),
}));
vi.mock('@/hooks/relay/info/useRelayHeaderInfo', () => ({ useRelayHeaderInfo: () => ({ name: 'Doc', icon: null }) }));

function setup(seed: Parameters<typeof fakeBridge>[0] = {}) {
  const selectGroup = vi.fn();
  const { result } = renderHook(() => useServerScreen(selectGroup), {
    wrapper: bridgeWrapper(fakeBridge({
      groups: [group({ id: 'f', kind: 'forum' }), group({ id: 't', parent: 'f' }), group({ id: 'a' })],
      childrenByParent: { f: ['t', 'gone'] },
      activeCallByChannel: { a: { hostPubkey: 'h', status: 'active', participantCount: 1, expiresAt: 0, createdAt: 0 } },
      ...seed,
    })),
  });
  return { result, selectGroup };
}

describe('useServerScreen', () => {
  it('names the space after the branding and keeps the roots', () => {
    const { result } = setup();
    expect(result.current.space).toEqual({ label: 'Brand', icon: 'brand.png', banner: null });
    expect(result.current.roots.map((g) => g.id)).toEqual(['f', 'a']);
  });

  it('expands a forum with threads until it is toggled, and marks a live call', () => {
    const { result } = setup();
    const forum = result.current.roots[0];
    expect(result.current.entryFor(forum)).toMatchObject({ expandable: true, expanded: true, live: false });
    expect(result.current.entryFor(forum).threads.map((g) => g.id)).toEqual(['t']);
    act(() => result.current.entryFor(forum).onToggleExpand!());
    expect(result.current.entryFor(forum).expanded).toBe(false);
    expect(result.current.entryFor(result.current.roots[1])).toMatchObject({ live: true, expandable: false, onToggleExpand: undefined });
    act(() => result.current.entryFor(forum).onToggleExpand!());
  });

  it('collapses a category', () => {
    const { result } = setup();
    expect(result.current.isCollapsed('c')).toBe(false);
    act(() => result.current.toggleCategory('c'));
    expect(result.current.isCollapsed('c')).toBe(true);
  });

  it('opens the active relay menu with the space label and icon', () => {
    const { result } = setup();
    act(() => result.current.openActiveRelayMenu());
    expect(result.current.relayMenuFor).toEqual({ url: BRIDGE_MOCK_RELAY, label: 'Brand', iconUrl: 'brand.png' });
    act(() => result.current.closeRelayMenu());
    expect(result.current.relayMenuFor).toBeNull();
  });

  it('opens a new channel sheet only with a relay, and a created channel as text', () => {
    const { result, selectGroup } = setup();
    act(() => result.current.openCreateChannel());
    expect(result.current.createChannelOpen).toBe(true);
    result.current.onChannelCreated('n');
    expect(selectGroup).toHaveBeenCalledWith('n', 'text');
    const empty = setup({ currentRelayUrl: '' });
    act(() => empty.result.current.openCreateChannel());
    expect(empty.result.current.createChannelOpen).toBe(false);
  });
});
