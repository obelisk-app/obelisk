import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { postGameTableCard } from '@/services/shell/panes/channel/game-table-card';

afterEach(() => unregisterBridge());

describe('postGameTableCard', () => {
  it('posts the marker to the channel as a plain message', async () => {
    const sendMessage = vi.fn(async () => {});
    registerBridge(fakeBridge({}, { sendMessage } as never));
    postGameTableCard('g', 'MARKER');
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith('g', 'MARKER', null, []));
  });

  it('logs a failure instead of throwing it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerBridge(fakeBridge({}, { sendMessage: vi.fn(async () => { throw new Error('nope'); }) } as never));
    expect(() => postGameTableCard('g', 'MARKER')).not.toThrow();
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('[games] posting the table card failed', expect.any(Error)));
    error.mockRestore();
  });
});
