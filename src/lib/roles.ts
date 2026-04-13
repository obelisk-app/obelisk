// Pure role/permission helpers — safe to import from client components.
// The server-side helpers (getAuthMember, requireRole) live in auth-roles.ts
// which re-exports these.

export type Role = 'owner' | 'admin' | 'mod' | 'member';

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  mod: 2,
  member: 1,
};

export function hasRole(memberRole: Role, minimumRole: Role): boolean {
  return (ROLE_HIERARCHY[memberRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 0);
}

/**
 * Channel-level "who can write here" check.
 *
 * `writePermission` values:
 *   - null / "everyone" — anyone (member+) can post
 *   - "mod"             — only mods, admins, owners can post
 *   - "admin"           — only admins and owners can post
 *
 * This is independent of ban/mute — those are checked separately.
 */
export function canWriteInChannel(
  memberRole: Role,
  channel: { writePermission?: string | null; writeRoleIds?: string[] | null },
  memberCustomRoleIds: string[] = []
): boolean {
  const wp = channel.writePermission;
  if (!wp || wp === 'everyone') return true;
  if (wp === 'mod') return hasRole(memberRole, 'mod');
  if (wp === 'admin') return hasRole(memberRole, 'admin');
  if (wp === 'roles') {
    if (hasRole(memberRole, 'admin')) return true;
    const allowed = channel.writeRoleIds ?? [];
    if (allowed.length === 0) return false;
    return memberCustomRoleIds.some((id) => allowed.includes(id));
  }
  return true;
}

/**
 * Channel-level "who can see" check. Mirrors canWriteInChannel but for
 * visibility: a user who fails this should not see the channel in the
 * sidebar, load its history, or receive its realtime events.
 *
 * `readPermission` values:
 *   - null / "everyone" — anyone (member+) can see
 *   - "mod"             — only mods, admins, owners can see
 *   - "admin"           — only admins and owners can see
 *   - "roles"           — members holding any of `readRoleIds` (admins+owners always can)
 */
export function canReadChannel(
  memberRole: Role,
  channel: { readPermission?: string | null; readRoleIds?: string[] | null },
  memberCustomRoleIds: string[] = []
): boolean {
  const rp = channel.readPermission;
  if (!rp || rp === 'everyone') return true;
  if (rp === 'mod') return hasRole(memberRole, 'mod');
  if (rp === 'admin') return hasRole(memberRole, 'admin');
  if (rp === 'roles') {
    if (hasRole(memberRole, 'admin')) return true;
    const allowed = channel.readRoleIds ?? [];
    if (allowed.length === 0) return false;
    return memberCustomRoleIds.some((id) => allowed.includes(id));
  }
  return true;
}
