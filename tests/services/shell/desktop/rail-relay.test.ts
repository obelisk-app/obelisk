import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { switchRelayFromRail } from '@/services/shell/desktop/rail-relay';
import { fakeBridge } from '@tests/support/fake-bridge';

afterEach(() => unregisterBridge());

describe('switchRelayFromRail', () => {
  it('switches to a relay that is not the open one', async () => {
    const switchRelay = vi.fn().mockResolvedValue(undefined);
    registerBridge(fakeBridge({}, { switchRelay }));
    await switchRelayFromRail('wss://b', 'wss://a');
    expect(switchRelay).toHaveBeenCalledWith('wss://b');
  });

  it('does nothing for the relay already open', async () => {
    const switchRelay = vi.fn();
    registerBridge(fakeBridge({}, { switchRelay }));
    await switchRelayFromRail('wss://a', 'wss://a');
    expect(switchRelay).not.toHaveBeenCalled();
  });

  it('logs a failed switch instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerBridge(fakeBridge({}, { switchRelay: vi.fn().mockRejectedValue(new Error('down')) }));
    await expect(switchRelayFromRail('wss://b', 'wss://a')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[appshell] switchRelay from rail failed', expect.any(Error));
    warn.mockRestore();
  });
});
