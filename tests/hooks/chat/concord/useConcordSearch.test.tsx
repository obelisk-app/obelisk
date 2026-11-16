import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';
import { expect, it } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { CommunityState, Rumor } from '@applesauce/concord';
import { useConcordSearch } from '@/hooks/chat/concord/useConcordSearch';

it('searches loaded history across accessible channels and routes publication matches to their thread', () => {
  const chat = { channel_id: 'chat', name: 'Chat', accessible: true, private: false, view: 'chat' };
  const publication = { ...chat, channel_id: 'posts', name: 'Posts', view: 'forum' };
  const channels$ = new BehaviorSubject([chat, publication]);
  const root = { id: 'b'.repeat(64), pubkey: 'a'.repeat(64), kind: 9, created_at: 2, content: 'search needle publication', tags: [['subject', 'Post']] } as Rumor;
  const chatRows = new BehaviorSubject([{ ...root, id: 'c'.repeat(64), content: 'search needle chat', tags: [] }]);
  const postRows = new BehaviorSubject([root]);
  const state$ = new BehaviorSubject({ banlist: new Set() } as unknown as CommunityState);
  const community = { channels$, state$, communityId: 'community', channelTimeline: (id: string) => id === 'chat' ? chatRows : postRows } as unknown as ConcordCommunity;
  const { result, unmount } = renderHook(() => useConcordSearch(community, []));
  act(() => result.current.setQuery('needle'));
  expect(result.current.hits).toHaveLength(2);
  expect(result.current.hits.find(row => row.id === root.id)?.groupId).toBe(`concord:community:posts:thread:${root.id}`);
  act(() => channels$.next([chat, { ...publication, accessible: false }]));
  expect(result.current.hits).toHaveLength(1);
  unmount();
  expect(channels$.observed).toBe(false);
  expect(chatRows.observed).toBe(false);
});
