import { BehaviorSubject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import type { CommunityState } from '@applesauce/concord';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { concordCommunityLayout } from '@/utils/chat/concord/layout';
import { publishConcordLayout } from '@/services/chat/concord/layout';
import { VSK } from '@/constants/chat/concord';

function fixture() {
  const state = { material: { community_id: 'community' }, metadata: { name: 'Community', relays: [], custom: { preserved: true } }, channels: [
    { channel_id: 'one', name: 'One', private: false, custom: { obelisk: { category: 'Legacy' } } },
    { channel_id: 'two', name: 'Two', private: false },
  ] } as unknown as CommunityState;
  const publishEdition = vi.fn().mockResolvedValue(undefined);
  const community = { communityId: 'community', phase$: new BehaviorSubject('live'), state$: new BehaviorSubject(state), canDo: () => true,
    admin: { latestEdition: async () => ({ hash: 'head', content: JSON.stringify(state.metadata) }), publishEdition },
  } as unknown as ConcordCommunity;
  return { community, state, publishEdition };
}
it('imports legacy categories into the native layout without losing uncategorized channels', () => {
  const { state } = fixture();
  const layout = concordCommunityLayout(state);
  expect(layout.categories.map(category => category.name)).toEqual(['Legacy']);
  expect(layout.channels[0]).toMatchObject({ id: 'concord:community:one', categoryId: layout.categories[0].id });
  expect(layout.channels[1].categoryId).toBeNull();
});
it('saves empty categories and channel assignments in one guarded encrypted metadata edition', async () => {
  const { community, state, publishEdition } = fixture();
  const original = concordCommunityLayout(state);
  const draft = { categories: [{ id: 'empty', name: 'Empty', position: 0 }, { id: 'chat', name: 'Chat', position: 1 }],
    channels: [{ id: 'concord:community:two', categoryId: 'chat', position: 0 }], updatedAt: 1 };
  await publishConcordLayout(community, draft, original);
  expect(publishEdition).toHaveBeenCalledTimes(1);
  expect(publishEdition.mock.calls[0][0]).toBe(VSK.METADATA);
  expect(publishEdition.mock.calls[0][4]).toEqual({ expectedHead: 'head' });
  const metadata = JSON.parse(publishEdition.mock.calls[0][2]);
  expect(metadata.custom.preserved).toBe(true);
  expect(metadata.custom.obelisk.layout.categories).toHaveLength(2);
  expect(metadata.custom.obelisk.layout.channels[0].id).toBe('two');
  expect(concordCommunityLayout({ ...state, metadata }).categories[0].name).toBe('Empty');
});
it('rejects a stale editor instead of overwriting another administrator layout', async () => {
  const { community, state, publishEdition } = fixture();
  const original = concordCommunityLayout(state);
  state.metadata!.custom = { obelisk: { layout: { categories: [], channels: [], updatedAt: 2 } } };
  await expect(publishConcordLayout(community, original, original)).rejects.toThrow('changed');
  expect(publishEdition).not.toHaveBeenCalled();
});
it('does not resurrect legacy categories after deleting the last shared category', () => {
  const { state } = fixture();
  state.metadata!.custom = { obelisk: { layout: { categories: [], channels: [], updatedAt: 2 } } };
  expect(concordCommunityLayout(state).categories).toEqual([]);
});
