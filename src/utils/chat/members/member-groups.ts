import type { JsMemberInfo } from '@/services/nostr-bridge';
import type { RelayRole } from '@/services/relay/relay-roles';

/** One titled section of the member list. */
export interface MemberGroup {
  readonly key: string;
  readonly label: string;
  readonly members: JsMemberInfo[];
}

/**
 * The member list's sections. Online members are bucketed by standing:
 * channel admins, then one section per relay role in tier order (the same
 * ladder the badge picks from: a member's first role is their top one), then
 * everyone without a role; empty sections are left out. Offline stays one
 * list regardless of standing: splitting absent people by rank is noise.
 */
export function groupMembers(
  memberList: ReadonlyArray<JsMemberInfo>,
  online: ReadonlySet<string>,
  rolesByPubkey: Readonly<Record<string, ReadonlyArray<RelayRole> | undefined>>,
  labels: { admin: string; member: string },
): { onlineGroups: MemberGroup[]; offline: JsMemberInfo[] } {
  const admins: JsMemberInfo[] = [];
  const plain: JsMemberInfo[] = [];
  const away: JsMemberInfo[] = [];
  const byRole = new Map<string, { role: RelayRole; members: JsMemberInfo[] }>();

  for (const member of memberList) {
    if (!online.has(member.pubkey)) {
      away.push(member);
      continue;
    }
    if (member.role === 'admin') {
      admins.push(member);
      continue;
    }
    const top = rolesByPubkey[member.pubkey]?.[0];
    if (!top) {
      plain.push(member);
      continue;
    }
    const bucket = byRole.get(top.id) ?? { role: top, members: [] };
    bucket.members.push(member);
    byRole.set(top.id, bucket);
  }

  const ranked = Array.from(byRole.values())
    .sort((a, b) => (b.role.tier - a.role.tier) || a.role.id.localeCompare(b.role.id))
    .map(({ role, members }) => ({
      key: role.id,
      label: role.emoji ? `${role.emoji} ${role.name}` : role.name,
      members,
    }));

  return {
    onlineGroups: [
      { key: 'admin', label: labels.admin, members: admins },
      ...ranked,
      { key: 'member', label: labels.member, members: plain },
    ].filter((group) => group.members.length > 0),
    offline: away,
  };
}
