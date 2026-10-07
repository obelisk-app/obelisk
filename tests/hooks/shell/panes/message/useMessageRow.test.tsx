import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { useMessageRow } from '@/hooks/shell/panes/message/useMessageRow';
import { useChatStore } from '@/store/chat';
import type { JsMessage } from '@/services/nostr-bridge';

const AUTHOR = 'a'.repeat(64);
const msg = { id: 'm'.repeat(64), pubkey: AUTHOR, content: 'hi', createdAt: 1, kind: 9, replyToId: null, mentions: [] } as unknown as JsMessage;

function setup(sendReaction = vi.fn(async () => {})) {
  const bridge = fakeBridge(
    { userMetadata: { [AUTHOR]: userMetadataFixture({ displayName: 'Ana' }) } },
    { sendReaction } as never,
  );
  return renderHook(() => useMessageRow({ msg, groupId: 'g', isAdmin: false, reactions: [] }), { wrapper: bridgeWrapper(bridge) });
}

describe('useMessageRow', () => {
  it('names the author from their profile', () => {
    const { result } = setup();
    expect(result.current.displayName).toBe('Ana');
    expect(result.current.toolbarPinned).toBe(false);
  });

  it('a body click pins the toolbar, but not one on a link inside the message', () => {
    const { result } = setup();
    const link = document.createElement('a');
    act(() => result.current.onBodyClick({ target: link } as never));
    expect(result.current.toolbarPinned).toBe(false);
    act(() => result.current.onBodyClick({ target: document.createElement('span') } as never));
    expect(result.current.toolbarPinned).toBe(true);
  });

  it('openProfile opens the author popup at the pointer', () => {
    const openProfilePopup = vi.fn();
    useChatStore.setState({ openProfilePopup } as never);
    const { result } = setup();
    result.current.openProfile({ clientX: 3, clientY: 4 } as never);
    expect(openProfilePopup).toHaveBeenCalledWith(AUTHOR, { x: 3, y: 4 });
  });

  it('picking a reaction closes the picker and pinned toolbar', () => {
    const { result } = setup();
    act(() => result.current.menus.togglePicker());
    expect(result.current.toolbarPinned).toBe(true);
    act(() => result.current.pickReaction('🔥'));
    expect(result.current.menus.pickerOpen).toBe(false);
    expect(result.current.toolbarPinned).toBe(false);
  });
});
