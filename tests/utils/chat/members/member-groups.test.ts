import { describe, expect, it } from 'vitest';
import { groupMembers } from '@/utils/chat/members/member-groups';
import type { JsMemberInfo } from '@/services/nostr-bridge';
import type { RelayRole } from '@/services/relay/relay-roles';

const m = (pubkey: string, role = 'member') => ({ pubkey, displayName: pubkey, role }) as unknown as JsMemberInfo;
const role = (id: string, tier: number, emoji?: string) => ({ id, name: id, tier, emoji }) as unknown as RelayRole;
const labels = { admin: 'Admins', member: 'Members' };

describe('groupMembers', () => {
  it('puts admins first, then relay roles by tier (ties by id), then plain members; offline apart', () => {
    const members = [m('a'), m('b', 'admin'), m('c'), m('d'), m('e'), m('f')];
    const online = new Set(['a', 'b', 'c', 'd', 'e']);
    const roles = { c: [role('mod', 5, '🔧')], d: [role('vip', 3)], e: [role('aaa', 3)] };
    const { onlineGroups, offline } = groupMembers(members, online, roles, labels);
    expect(onlineGroups.map((g) => [g.key, g.label, g.members.map((x) => x.pubkey)])).toEqual([
      ['admin', 'Admins', ['b']],
      ['mod', '🔧 mod', ['c']],
      ['aaa', 'aaa', ['e']],
      ['vip', 'vip', ['d']],
      ['member', 'Members', ['a']],
    ]);
    expect(offline.map((x) => x.pubkey)).toEqual(['f']);
  });

  it('leaves out empty sections, and an offline admin stays offline', () => {
    const { onlineGroups, offline } = groupMembers([m('a', 'admin')], new Set(), {}, labels);
    expect(onlineGroups).toEqual([]);
    expect(offline).toHaveLength(1);
  });
});
