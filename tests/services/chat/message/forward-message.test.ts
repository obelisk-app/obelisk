import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { translator } from '@tests/support/intl';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { useToastStore } from '@/store/feedback/toast';
import { forwardMessage } from '@/services/chat/message/forward-message';
import type { JsGroup } from '@/services/nostr-bridge';

const target = { id: 'abcdef1234', name: null } as unknown as JsGroup;
const t = translator('en');

describe('forwardMessage', () => {
  afterEach(() => {
    unregisterBridge();
    useToastStore.setState({ toasts: [] } as never);
  });

  it('sends the quote and toasts the channel (its id when it has no name)', async () => {
    const sendMessage = vi.fn(async () => undefined);
    registerBridge(fakeBridge({}, { sendMessage } as never));
    expect(await forwardMessage(target, { content: 'hi' }, { authorName: 'Ana', fromChannel: null }, t)).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith('abcdef1234', '**Forwarded** · Ana\n> hi', undefined, undefined);
    expect(useToastStore.getState().toasts.at(-1)?.title).toContain('abcdef12');
  });

  it('a failure toasts and resolves false', async () => {
    registerBridge(fakeBridge({}, { sendMessage: async () => { throw new Error('x'); } } as never));
    expect(await forwardMessage(target, { content: 'hi' }, { authorName: 'Ana', fromChannel: null }, t)).toBe(false);
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe("Couldn't forward the message");
  });
});
