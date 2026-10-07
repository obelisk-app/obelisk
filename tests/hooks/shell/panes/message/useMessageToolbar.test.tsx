import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageToolbar } from '@/hooks/shell/panes/message/useMessageToolbar';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import type { JsMessage } from '@/services/nostr-bridge';

const msg = { id: 'm1', pubkey: 'a'.repeat(64) } as JsMessage;

function setup() {
  const actions = { quick3: [{ char: '🔥' }, { char: '⚡' }], myReactedEmojis: new Set(['⚡']), reactWith: vi.fn() } as unknown as MessageRowActions;
  const props = { msg, actions, closeAll: vi.fn(), toggleMenu: vi.fn(), onForward: vi.fn(), onReply: vi.fn() };
  const { result } = renderHook(() => useMessageToolbar(props));
  return { vm: result.current, props, actions };
}

describe('useMessageToolbar', () => {
  it('offers the recent reactions, marking the ones already sent', () => {
    expect(setup().vm.slots.map((s) => [s.emoji.char, s.mine])).toEqual([['🔥', false], ['⚡', true]]);
  });

  it('react, reply and forward act and then close the overlays', () => {
    const { vm, props, actions } = setup();
    vm.react({ char: '🔥' });
    expect(actions.reactWith).toHaveBeenCalledWith({ char: '🔥' });
    vm.reply();
    expect(props.onReply).toHaveBeenCalledWith(msg);
    vm.forward();
    expect(props.onForward).toHaveBeenCalledTimes(1);
    expect(props.closeAll).toHaveBeenCalledTimes(3);
  });

  it('more toggles the menu without letting the click reach the row', () => {
    const { vm, props } = setup();
    const stopPropagation = vi.fn();
    vm.more({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(props.toggleMenu).toHaveBeenCalledTimes(1);
  });
});
