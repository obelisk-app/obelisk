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
  channel: { writePermission: string | null }
): boolean {
  const wp = channel.writePermission;
  if (!wp || wp === 'everyone') return true;
  if (wp === 'mod') return hasRole(memberRole, 'mod');
  if (wp === 'admin') return hasRole(memberRole, 'admin');
  return true;
}
