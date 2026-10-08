import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { useDesktopSidebar } from '@/hooks/shell/desktop/useDesktopSidebar';
import { fakeBridge } from '@tests/support/fake-bridge';

afterEach(() => unregisterBridge());

function setup() {
  const setView = vi.fn();
  const { result } = renderHook(() => useDesktopSidebar({ relay: 'wss://a', setView }));
  return { vm: result.current, setView };
}

describe('useDesktopSidebar', () => {
  it('opens the DM list', () => {
    const { vm, setView } = setup();
    vm.pickDm();
    expect(setView).toHaveBeenCalledWith({ kind: 'dm', peer: null });
  });

  it('opens a DM thread', () => {
    const { vm, setView } = setup();
    vm.pickPeer('pk');
    expect(setView).toHaveBeenCalledWith({ kind: 'dm', peer: 'pk' });
  });

  it('clears the view before switching relays and handles a failed switch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const switchRelay = vi.fn().mockRejectedValue(new Error('down'));
    registerBridge(fakeBridge({}, { switchRelay }));
    const { vm, setView } = setup();
    await vm.pickRelay('wss://b');
    expect(setView).toHaveBeenCalledWith({ kind: 'empty' });
    expect(switchRelay).toHaveBeenCalledWith('wss://b');
    expect(setView.mock.invocationCallOrder[0]).toBeLessThan(switchRelay.mock.invocationCallOrder[0]);
    warn.mockRestore();
  });
});
