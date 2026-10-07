import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useChannelMessage } from '@/hooks/shell/mobile/screens/channel/useChannelMessage';
import { message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const MSG = message({ id: 'm2', pubkey: 'b'.repeat(64), replyToId: 'm1' });
const PARENT = message({ id: 'm1' });
const click = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as MouseEvent & Record<'preventDefault' | 'stopPropagation', ReturnType<typeof vi.fn>>;

function setup(over: Partial<Parameters<typeof useChannelMessage>[0]> = {}, methods: Record<string, unknown> = {}) {
  const onLongPress = vi.fn();
  const { result } = renderHook(() => useChannelMessage({
    msg: MSG, parent: PARENT, groupId: 'g', reactions: [], myPubkey: null, isAdmin: false, onLongPress, ...over,
  }), { wrapper: bridgeWrapper(fakeBridge({ userMetadata: { [MSG.pubkey]: { name: 'Bea' } as never } }, methods as never)) });
  return { result, onLongPress };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useChannelMessage', () => {
  it('names the author', () => {
    expect(setup().result.current.name).toBe('Bea');
  });

  it('opens the action sheet after a 500ms hold, not when the touch ends early', () => {
    vi.useFakeTimers();
    const { result, onLongPress } = setup();
    act(() => result.current.startPress());
    act(() => { vi.advanceTimersByTime(300); });
    act(() => result.current.cancelPress());
    act(() => { vi.advanceTimersByTime(500); });
    expect(onLongPress).not.toHaveBeenCalled();
    act(() => result.current.startPress());
    act(() => { vi.advanceTimersByTime(500); });
    expect(onLongPress).toHaveBeenCalledWith(MSG);
  });

  it('opens the action sheet on a right-click instead of the browser menu', () => {
    const { result, onLongPress } = setup();
    const e = click();
    act(() => result.current.onContextMenu(e));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(onLongPress).toHaveBeenCalledWith(MSG);
  });

  it('jumps to the quoted message without the tap reaching the tile', () => {
    document.body.innerHTML = '<div data-msg-id="m1"></div>';
    const el = document.querySelector('[data-msg-id="m1"]')!;
    el.scrollIntoView = vi.fn();
    const { result } = setup();
    const e = click();
    act(() => result.current.jumpToParent(e));
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(el.classList.contains('msg-flash')).toBe(true);
  });

  it('lets an admin remove a reaction for everyone', async () => {
    const deleteGroupEvent = vi.fn().mockResolvedValue(undefined);
    const reactions = [{ id: 'r1', pubkey: 'c'.repeat(64), emoji: '🔥' }];
    const { result } = setup({ reactions, isAdmin: true }, { deleteGroupEvent });
    expect(result.current.grouped).toHaveLength(1);
    act(() => result.current.toggleReaction(result.current.grouped[0]));
    await vi.waitFor(() => expect(deleteGroupEvent).toHaveBeenCalledWith('g', 'r1'));
  });
});
