import { describe, expect, it, vi } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { concordChannelProtocol } from '@/services/chat/concord/channel-protocol';

describe('shared encrypted channel commands', () => {
  it('hands files to the encrypted SDK uploader only when sending, and preserves replies', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const community = { communityId: 'community', sendMessage } as unknown as ConcordCommunity;
    const files = new Map<string, File>();
    const adapter = concordChannelProtocol(community, 'channel', [], files);
    const file = new File(['private bytes'], 'private.txt');
    const token = await adapter.upload(file);
    expect(sendMessage).not.toHaveBeenCalled();
    await adapter.send(`hello\n${token}`, { id: 'parent', pubkey: 'author' }, []);
    expect(sendMessage).toHaveBeenCalledWith('channel', 'hello', { id: 'parent', author: 'author' }, [file]);
    expect(files.size).toBe(0);
  });

  it('retains selected attachments if the encrypted send fails', async () => {
    const community = { communityId: 'community', sendMessage: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as ConcordCommunity;
    const files = new Map<string, File>();
    const adapter = concordChannelProtocol(community, 'channel', [], files);
    const token = await adapter.upload(new File(['private bytes'], 'private.txt'));
    await expect(adapter.send(token, null, [])).rejects.toThrow('offline');
    expect(files.has(token)).toBe(true);
  });
});
