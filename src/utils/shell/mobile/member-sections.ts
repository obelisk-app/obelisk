/**
 * The phone member list's sections, the same ladder as the desktop rail:
 * admins on top (their own section), then one section per relay role in
 * tier order, then everyone holding no role.
 */

interface RankedRole {
  readonly id: string;
  readonly name: string;
  readonly tier: number;
  readonly emoji?: string | null;
}

export interface MemberSection {
  key: string;
  label: string;
  pubkeys: string[];
}

/** Everyone in the channel once, admins first. */
export function everyoneIn(admins: ReadonlyArray<string>, members: ReadonlyArray<string>): string[] {
  return [...new Set<string>([...admins, ...members])];
}

/** The members who are not admins, in member order. */
export function nonAdminMembers(members: ReadonlyArray<string>, admins: ReadonlyArray<string>): string[] {
  const adminSet = new Set(admins);
  return members.filter((m) => !adminSet.has(m));
}

/**
 * One section per top role (highest tier first, then by id), then the
 * members with no role under `membersLabel`. Empty sections are left out.
 */
export function rankMemberSections(
  pubkeys: ReadonlyArray<string>,
  rolesByPubkey: Readonly<Record<string, ReadonlyArray<RankedRole> | undefined>>,
  membersLabel: string,
): MemberSection[] {
  const byRole = new Map<string, { role: RankedRole; pubkeys: string[] }>();
  const plain: string[] = [];
  for (const pubkey of pubkeys) {
    const top = rolesByPubkey[pubkey]?.[0];
    if (!top) {
      plain.push(pubkey);
      continue;
    }
    const bucket = byRole.get(top.id) ?? { role: top, pubkeys: [] };
    bucket.pubkeys.push(pubkey);
    byRole.set(top.id, bucket);
  }
  const ranked = Array.from(byRole.values())
    .sort((a, b) => (b.role.tier - a.role.tier) || a.role.id.localeCompare(b.role.id))
    .map(({ role, pubkeys: inRole }) => ({
      key: role.id,
      label: role.emoji ? `${role.emoji} ${role.name}` : role.name,
      pubkeys: inRole,
    }));
  return [...ranked, { key: 'member', label: membersLabel, pubkeys: plain }]
    .filter((section) => section.pubkeys.length > 0);
}

/** Active within `windowMs` before `now`, by the last activity time (unix ms). */
export function isRecentlyActive(at: number | undefined, now: number, windowMs: number): boolean {
  return !!at && at >= now - windowMs;
}
