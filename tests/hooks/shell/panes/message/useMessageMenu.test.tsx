import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageMenu } from '@/hooks/shell/panes/message/useMessageMenu';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import type { MessageRowMenus } from '@/hooks/shell/panes/message/useMessageRowMenus';
import type { JsMessage } from '@/services/nostr-bridge';

const msg = { id: 'm1', pubkey: 'a'.repeat(64) } as JsMessage;

function setup() {
  const actions = {
    quick4: [{ char: '🔥' }], myReactedEmojis: new Set<string>(), reactWith: vi.fn(), onZapClick: vi.fn(),
    copyText: vi.fn(), copyLink: vi.fn(), toggleMute: vi.fn(async () => {}), deleteMessage: vi.fn(async () => {}),
  } as unknown as MessageRowActions;
  const menus = { setMenuOpen: vi.fn(), closeAll: vi.fn(), setForwarding: vi.fn() } as unknown as MessageRowMenus;
  const onReply = vi.fn();
  const { result } = renderHook(() => useMessageMenu({ msg, actions, menus, onReply }));
  return { vm: result.current, actions, menus, onReply };
}

describe('useMessageMenu', () => {
  it('a quick reaction closes every overlay of the row', () => {
    const { vm, actions, menus } = setup();
    expect(vm.slots).toEqual([{ emoji: { char: '🔥' }, mine: false }]);
    vm.react({ char: '🔥' });
    expect(actions.reactWith).toHaveBeenCalledWith({ char: '🔥' });
    expect(menus.closeAll).toHaveBeenCalledTimes(1);
    expect(menus.setMenuOpen).not.toHaveBeenCalled();
  });

  it('each item acts, then closes only the menu', () => {
    const { vm, actions, menus, onReply } = setup();
    vm.reply();
    vm.forward();
    vm.zap();
    vm.copyText();
    vm.copyLink();
    vm.toggleMute();
    vm.deleteMessage();
    expect(onReply).toHaveBeenCalledWith(msg);
    expect(menus.setForwarding).toHaveBeenCalledWith(true);
    for (const fn of [actions.onZapClick, actions.copyText, actions.copyLink, actions.toggleMute, actions.deleteMessage]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(menus.setMenuOpen).toHaveBeenCalledTimes(7);
    expect(menus.setMenuOpen).toHaveBeenCalledWith(false);
    expect(menus.closeAll).not.toHaveBeenCalled();
  });
});
