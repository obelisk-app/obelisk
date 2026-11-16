import { describe, expect, it, vi } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { concordChannelProtocol } from '@/services/chat/concord/channel-protocol';

const { enqueue } = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('@/services/chat/concord/outbox', () => ({ concordOutbox: () => ({ enqueue }) }));
describe('shared encrypted channel commands', () => {
  it('hands files to the encrypted SDK uploader only when sending, and preserves replies', async () => {
    enqueue.mockReset();
    const community = { communityId: 'community' } as unknown as ConcordCommunity;
    const files = new Map<string, File>();
    const adapter = concordChannelProtocol(community, 'channel', [], files);
    const file = new File(['private bytes'], 'private.txt');
    const token = await adapter.upload(file);
    expect(enqueue).not.toHaveBeenCalled();
    await adapter.send(`hello\n${token}`, { id: 'parent', pubkey: 'author' }, []);
    expect(enqueue).toHaveBeenCalledWith('channel', 'hello', { id: 'parent', pubkey: 'author' }, [file]);
    expect(files.size).toBe(0);
  });

  it('retains composer attachments when the outbox cannot accept the send', async () => {
    enqueue.mockImplementationOnce(() => { throw new Error('outbox full'); });
    const community = { communityId: 'community' } as unknown as ConcordCommunity;
    const files = new Map<string, File>();
    const adapter = concordChannelProtocol(community, 'channel', [], files);
    const token = await adapter.upload(new File(['private bytes'], 'private.txt'));
    await expect(adapter.send(token, null, [])).rejects.toThrow('outbox full');
    expect(files.has(token)).toBe(true);
  });
});
