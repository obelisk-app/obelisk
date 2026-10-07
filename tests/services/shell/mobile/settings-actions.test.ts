import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { useHintsStore } from '@/store/hints';
import { useToastStore } from '@/store/feedback/toast';
import { disconnect, replayHints } from '@/services/shell/mobile/settings-actions';

afterEach(() => unregisterBridge());

describe('replayHints', () => {
  it('resets the hints and confirms with a toast', () => {
    const resetHints = vi.fn();
    useHintsStore.setState({ resetHints } as never);
    useToastStore.setState({ toasts: [] });
    replayHints('Hints are back');
    expect(resetHints).toHaveBeenCalled();
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ title: 'Hints are back', body: '' });
  });
});

describe('disconnect', () => {
  it('logs out through the bridge', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    registerBridge(fakeBridge({}, { logout } as never));
    disconnect();
    await vi.waitFor(() => expect(logout).toHaveBeenCalled());
  });
});
