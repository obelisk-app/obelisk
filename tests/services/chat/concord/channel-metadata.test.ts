import { expect, it, vi } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { setConcordChannelName, editConcordChannel } from '@/services/chat/concord/channel-metadata';
import { VSK } from '@/constants/chat/concord';

it('renames only the channel name and retains the edition concurrency guard', async () => {
  const metadata = { name: 'old', private: true, custom: { vendor: { value: 1 } }, view: 'forum' };
  const publishEdition = vi.fn();
  const community = { admin: { latestEdition: vi.fn().mockResolvedValue({ hash: 'head', content: JSON.stringify(metadata) }), publishEdition } } as unknown as ConcordCommunity;
  await setConcordChannelName(community, 'channel-id', ' new ');
  expect(publishEdition).toHaveBeenCalledWith(VSK.CHANNEL, 'channel-id', JSON.stringify({ ...metadata, name: 'new' }), 'channel-metadata', { expectedHead: 'head' });
});

it('does not publish when the authoritative metadata is missing', async () => {
  const publishEdition = vi.fn();
  const community = { admin: { latestEdition: vi.fn().mockResolvedValue(undefined), publishEdition } } as unknown as ConcordCommunity;
  await expect(setConcordChannelName(community, 'channel-id', 'new')).rejects.toThrow();
  expect(publishEdition).not.toHaveBeenCalled();
});

it('moves and orders an existing channel without dropping unknown metadata or privacy', async () => {
  const metadata = { name: 'old', private: true, custom: { vendor: { value: 1 }, obelisk: { category: 'Old', extra: 'keep' } }, view: 'forum' };
  const publishEdition = vi.fn();
  const community = { admin: { latestEdition: vi.fn().mockResolvedValue({ hash: 'head', content: JSON.stringify(metadata) }), publishEdition } } as unknown as ConcordCommunity;
  await editConcordChannel(community, 'channel-id', { name: 'new', category: ' New ', position: '3' });
  expect(JSON.parse(publishEdition.mock.calls[0][2])).toEqual({ ...metadata, name: 'new', custom: { ...metadata.custom, obelisk: { category: 'New', position: 3, extra: 'keep' } } });
  expect(publishEdition.mock.calls[0][4]).toEqual({ expectedHead: 'head' });
});
