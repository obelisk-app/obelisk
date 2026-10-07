import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';
import { useChannelScreen } from '@/hooks/shell/mobile/screens/channel/useChannelScreen';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

function setup(seed: Parameters<typeof fakeBridge>[0] = {}) {
  const openMsgActions = vi.fn();
  const openProfile = vi.fn();
  const { result } = renderHook(() => useChannelScreen({ groupId: 'g1', openMsgActions, openProfile }), {
    wrapper: bridgeWrapper(fakeBridge({
      groups: [group({ id: 'g1', name: 'general' })],
      messagesByGroup: { g1: [message({ id: 'm1', pubkey: BRIDGE_MOCK_PUBKEY })] },
      ...seed,
    }, { fetchGroupMetadata: vi.fn().mockResolvedValue(undefined), subscribeFilterWatched: () => () => {} } as never)),
  });
  return { result, openMsgActions, openProfile };
}

describe('useChannelScreen', () => {
  it('builds the header and a timeline with a day divider before the first message', () => {
    const { result } = setup();
    expect(result.current.header.channel).toBe('general');
    expect(result.current.timeline.map((i) => i.type)).toEqual(['divider', 'msg']);
    expect(result.current.messagesById.get('m1')?.id).toBe('m1');
  });

  it('builds the action-sheet context from a message, own messages deletable', () => {
    const { result, openMsgActions } = setup({ adminsByGroup: { g1: [BRIDGE_MOCK_PUBKEY] } });
    result.current.onLongPressMessage(result.current.messages[0]);
    expect(openMsgActions).toHaveBeenCalledWith({ id: 'm1', pubkey: BRIDGE_MOCK_PUBKEY, content: 'hello', groupId: 'g1', canModerate: true, canDeleteOwn: true });
  });

  it('opens and closes the settings and new-game sheets', () => {
    const { result } = setup();
    act(() => result.current.openSettings());
    expect(result.current.settingsOpen).toBe(true);
    act(() => result.current.closeSettings());
    act(() => result.current.openNewGame());
    expect(result.current.newGameOpen).toBe(true);
    act(() => result.current.closeNewGame());
    expect(result.current.settingsOpen || result.current.newGameOpen).toBe(false);
  });

  it('keeps the row callbacks stable across renders', () => {
    const { result } = setup();
    const first = result.current.onLongPressMessage;
    act(() => result.current.openSettings());
    expect(result.current.onLongPressMessage).toBe(first);
  });
});
