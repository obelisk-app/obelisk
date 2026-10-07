import { describe, expect, it } from 'vitest';
import { everyoneIn, isRecentlyActive, nonAdminMembers, rankMemberSections } from '@/utils/shell/mobile/member-sections';

const MOD = { id: 'mod', name: 'Moderator', tier: 5, emoji: '🛡️' };
const OG = { id: 'og', name: 'OG', tier: 2, emoji: '' };
const VIP = { id: 'vip', name: 'VIP', tier: 2 };

describe('rankMemberSections', () => {
  it('sections by top role, highest tier first and by id on a tie, then the rest', () => {
    const sections = rankMemberSections(['m', 'o', 'v', 'p'], { m: [MOD], o: [OG], v: [VIP, MOD] }, 'Members');
    expect(sections).toEqual([
      { key: 'mod', label: '🛡️ Moderator', pubkeys: ['m'] },
      { key: 'og', label: 'OG', pubkeys: ['o'] },
      { key: 'vip', label: 'VIP', pubkeys: ['v'] },
      { key: 'member', label: 'Members', pubkeys: ['p'] },
    ]);
  });

  it('leaves empty sections out', () => {
    expect(rankMemberSections(['m'], { m: [MOD] }, 'Members').map((s) => s.key)).toEqual(['mod']);
    expect(rankMemberSections([], {}, 'Members')).toEqual([]);
  });
});

describe('the member list helpers', () => {
  it('lists everyone once, admins first', () => {
    expect(everyoneIn(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('drops the admins from the members', () => {
    expect(nonAdminMembers(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c']);
  });

  it('counts activity inside the window, the edge included', () => {
    expect(isRecentlyActive(900, 1000, 100)).toBe(true);
    expect(isRecentlyActive(899, 1000, 100)).toBe(false);
    expect(isRecentlyActive(undefined, 1000, 100)).toBe(false);
  });
});
