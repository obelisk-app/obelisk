import { BehaviorSubject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { createConcordPublication } from '@/services/chat/concord/publications';
it('publishes titled native chat events and retries the identical event after partial relay delivery', async () => {
  const publishToPlane = vi.fn().mockRejectedValueOnce(new Error('ack timeout')).mockResolvedValue('a'.repeat(64));
  const community = { phase$: new BehaviorSubject('live'), communityId: 'community', material: { root_epoch: 0, channels: [] }, publishToPlane } as unknown as ConcordCommunity;
  await expect(createConcordPublication(community, 'channel', 'Title', 'Body')).rejects.toThrow('ack timeout');
  const prepared = publishToPlane.mock.calls[0][1];
  expect(prepared.kind).toBe(9);
  expect(prepared.tags).toContainEqual(['subject', 'Title']);
  expect(await createConcordPublication(community, 'channel', 'Title', 'Body')).toBe(`concord:community:channel:thread:${'a'.repeat(64)}`);
  expect(publishToPlane.mock.calls[1][1]).toBe(prepared);
});
