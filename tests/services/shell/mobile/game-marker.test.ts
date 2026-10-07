import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { postGameMarker } from '@/services/shell/mobile/game-marker';

afterEach(() => unregisterBridge());

describe('postGameMarker', () => {
  it('sends the marker to the channel as a plain message', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    registerBridge(fakeBridge({}, { sendMessage } as never));
    postGameMarker('g1', 'game:abc');
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith('g1', 'game:abc', null, []));
  });

  it('logs a failed post instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerBridge(fakeBridge({}, { sendMessage: vi.fn().mockRejectedValue(new Error('down')) } as never));
    expect(() => postGameMarker('g1', 'game:abc')).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[games] posting the table card failed', expect.any(Error)));
    warn.mockRestore();
  });
});
