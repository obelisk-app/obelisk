import { expect, it } from 'vitest';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { communityRailEntries } from '@/utils/chat/concord/community-rail';

it('orders communities together by name rather than separating protocols', () => {
  const community = { communityId: 'private-id', state$: { value: { metadata: { name: 'middle' } } }, material: { name: 'original' } } as unknown as ConcordCommunity;
  const entries = communityRailEntries(['wss://z.example', 'wss://a.example'], [community]);
  expect(entries.map(entry => entry.key)).toEqual(['wss://a.example', 'private-id', 'wss://z.example']);
});
