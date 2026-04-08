'use client';

import type { Role } from '@/lib/auth-roles';

const ROLE_COLORS: Record<Role, string> = {
  owner: 'bg-lc-green text-lc-black',
  admin: 'bg-amber-500 text-black',
  mod: 'bg-blue-500 text-white',
  member: 'bg-lc-border text-lc-muted',
};

export default function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      data-testid="role-badge"
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${ROLE_COLORS[role] || ROLE_COLORS.member}`}
    >
      {role}
    </span>
  );
}
