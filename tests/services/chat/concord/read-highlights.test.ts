import { BehaviorSubject } from 'rxjs';
import { afterEach, expect, it } from 'vitest';
import type { ConcordClient, ConcordCommunity } from '@applesauce/concord/client';
import type { CommunityState, Rumor } from '@applesauce/concord';
import { startConcordReadHighlights } from '@/services/chat/concord/read-highlights';
import { useConcordReadStore } from '@/store/chat/concord-read';

afterEach(() => useConcordReadStore.getState().reset(null));
it('updates background badges from local SDK history and removes them when access is lost', () => {
  const me = 'a'.repeat(64), author = 'b'.repeat(64), channel = { channel_id: 'general', name: 'General', accessible: true, private: false, view: 'chat' };
  const channels$ = new BehaviorSubject([channel]);
  const timeline = new BehaviorSubject<Rumor[]>([]);
  const state$ = new BehaviorSubject({ channels: [channel], banlist: new Set() } as unknown as CommunityState);
  const community = { pubkey: me, communityId: 'community', channels$, state$, channelTimeline: () => timeline } as unknown as ConcordCommunity;
  const communities$ = new BehaviorSubject([{ material: { community_id: 'community' } }]);
  const client = { communities$, getCommunity: () => community } as unknown as ConcordClient;
  useConcordReadStore.getState().reset(me, 'current-generation');
  const stop = startConcordReadHighlights(client, 'current-generation');
  const time = Math.floor(Date.now() / 1000);
  const key = 'concord:community:general';
  timeline.next([{ id: 'c'.repeat(64), pubkey: author, kind: 9, content: 'Hello', tags: [['p', me]], created_at: time }]);
  expect(useConcordReadStore.getState().highlights[key]).toMatchObject({ unread: 1, mentions: 1 });
  useConcordReadStore.getState().merge(me, { [key]: time * 1000 });
  expect(useConcordReadStore.getState().highlights[key].unread).toBe(0);
  channels$.next([]);
  expect(useConcordReadStore.getState().highlights[key]).toBeUndefined();
  stop();
});
