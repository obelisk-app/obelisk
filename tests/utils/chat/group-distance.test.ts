import { describe, expect, it } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { groupDistances } from '@/utils/chat/group-distance';

const g1 = groupFixture({ id: 'g1', name: 'one', kind: 'text' });
const g2 = groupFixture({ id: 'g2', name: 'two', kind: 'text' });
const distance: Record<string, number> = { creator: 3, admin: 1, member: 2 };
const lookup = (pk: string) => distance[pk] ?? null;

describe('groupDistances', () => {
  it('takes the closest of creator, admins and members', () => {
    const out = groupDistances([g1], { g1: 'creator' }, { g1: ['admin'] }, { g1: ['member'] }, lookup);
    expect(out).toEqual({ g1: 1 });
  });

  it('counts the creator even with no admin or member lists', () => {
    expect(groupDistances([g1], { g1: 'creator' }, {}, {}, lookup)).toEqual({ g1: 3 });
  });

  it('is null for a channel where nobody is in the graph', () => {
    expect(groupDistances([g1, g2], {}, { g1: ['stranger'] }, {}, lookup)).toEqual({ g1: null, g2: null });
  });
});
