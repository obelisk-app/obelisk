import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY, groupFixture, messageFixture } from '@tests/support/mocks/nostr-bridge';
import { useVoiceStore } from '@/store/voice';

const zaps = vi.hoisted(() => new Map());
vi.mock('@/hooks/chat/zaps/useMessageZaps', () => ({ useMessageZaps: () => zaps }));
vi.mock('@/hooks/games/channel/useChannelGames', () => ({ useChannelGamesSubscription: () => {} }));

import { useChatPanel } from '@/hooks/shell/panes/channel/useChatPanel';

const groups = [
  groupFixture({ id: 'g', name: 'general' }),
  groupFixture({ id: 'g2', name: 'random' }),
  groupFixture({ id: 'v', kind: 'voice-sfu' }),
];
const m1 = messageFixture({ id: 'm1', createdAt: 1 });

function setup(groupId = 'g', { showMembers = false, seed = {} } = {}) {
  return renderHook(
    ({ id }) => useChatPanel({ groupId: id, showMembers, pendingMessageId: null, onConsumePendingMessageId: vi.fn() }),
    { initialProps: { id: groupId }, wrapper: bridgeWrapper(fakeBridge({ groups, messagesByGroup: { g: [m1] }, ...seed })) },
  );
}

beforeEach(() => useVoiceStore.setState({ isVoiceChatOpen: false }));

describe('useChatPanel', () => {
  it('a text channel: its messages by id, the list visible, members on request only', () => {
    const { result } = setup('g', { showMembers: true });
    expect(result.current.body).toBe('text');
    expect(result.current.messagesById.get('m1')).toBe(m1);
    expect(result.current.messagesVisible).toBe(true);
    expect(result.current.showMembersColumn).toBe(true);
    expect(result.current.isAdmin).toBe(false);
  });

  it('a voice channel never shows the members column', () => {
    const { result } = setup('v', { showMembers: true });
    expect(result.current.body).toBe('voice');
    expect(result.current.showMembersColumn).toBe(false);
  });

  it('knows an admin', () => {
    expect(setup('g', { seed: { adminsByGroup: { g: [BRIDGE_MOCK_PUBKEY] } } }).result.current.isAdmin).toBe(true);
  });

  it('drops the reply target when the channel changes', () => {
    const { result, rerender } = setup();
    act(() => result.current.setReplyingTo(m1));
    expect(result.current.replyingTo).toBe(m1);
    rerender({ id: 'g2' });
    expect(result.current.replyingTo).toBeNull();
  });

  it('opens and closes the new-game and settings dialogs', () => {
    const { result } = setup();
    act(() => result.current.openNewGame());
    expect(result.current.newGameOpen).toBe(true);
    act(() => result.current.closeNewGame());
    expect(result.current.newGameOpen).toBe(false);
    act(() => result.current.openSettings());
    expect(result.current.showSettings).toBe(true);
    act(() => result.current.closeSettings());
    expect(result.current.showSettings).toBe(false);
  });

  it('toggles and hides the chat docked beside a voice room', () => {
    const { result } = setup('v');
    act(() => result.current.voiceChat.toggle());
    expect(useVoiceStore.getState().isVoiceChatOpen).toBe(true);
    expect(result.current.voiceChat.open).toBe(true);
    act(() => result.current.voiceChat.hide());
    expect(result.current.voiceChat.open).toBe(false);
  });

  it('hands dropped files to the composer, and does nothing before it mounts', () => {
    const { result } = setup();
    const file = new File(['x'], 'a.png');
    expect(() => result.current.pickFiles([file])).not.toThrow();
    const pickFiles = vi.fn();
    (result.current.composerRef as { current: unknown }).current = { pickFiles };
    result.current.pickFiles([file]);
    expect(pickFiles).toHaveBeenCalledWith([file]);
  });
});
