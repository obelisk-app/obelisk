import { expect, it } from 'vitest';
import type { CommunityState, Rumor } from '@applesauce/concord';
import { projectConcordTimeline } from '@/utils/chat/concord/timeline';

it('renders a rumor received from multiple relays only once', () => {
  const rumor = { id: 'a'.repeat(64), pubkey: 'b'.repeat(64), kind: 9, created_at: 1, content: 'image', tags: [] } as Rumor;
  const state = { banlist: new Set() } as CommunityState;
  expect(projectConcordTimeline([rumor, rumor, { ...rumor }], state, 'channel')).toHaveLength(1);
});
