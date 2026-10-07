import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { useDesktopDrawer } from '@/hooks/shell/desktop/useDesktopDrawer';
import { fakeBridge } from '@tests/support/fake-bridge';

afterEach(() => unregisterBridge());

function setup() {
  const setView = vi.fn();
  const closeDrawer = vi.fn();
  const { result } = renderHook(() => useDesktopDrawer({ relay: 'wss://a', setView, closeDrawer }));
  return { vm: result.current, setView, closeDrawer };
}

describe('useDesktopDrawer', () => {
  it('opens the DM list and closes the drawer', () => {
    const { vm, setView, closeDrawer } = setup();
    vm.pickDm();
    expect(setView).toHaveBeenCalledWith({ kind: 'dm', peer: null });
    expect(closeDrawer).toHaveBeenCalled();
  });

  it('opens a DM thread, or any view, and closes the drawer', () => {
    const { vm, setView, closeDrawer } = setup();
    vm.pickPeer('pk');
    expect(setView).toHaveBeenCalledWith({ kind: 'dm', peer: 'pk' });
    vm.pickView({ kind: 'group', groupId: 'g' });
    expect(setView).toHaveBeenLastCalledWith({ kind: 'group', groupId: 'g' });
    expect(closeDrawer).toHaveBeenCalledTimes(2);
  });

  it('clears the view, switches relay, then closes the drawer even when the switch fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const switchRelay = vi.fn().mockRejectedValue(new Error('down'));
    registerBridge(fakeBridge({}, { switchRelay }));
    const { vm, setView, closeDrawer } = setup();
    await vm.pickRelay('wss://b');
    expect(setView).toHaveBeenCalledWith({ kind: 'empty' });
    expect(switchRelay).toHaveBeenCalledWith('wss://b');
    expect(closeDrawer).toHaveBeenCalled();
    warn.mockRestore();
  });
});
