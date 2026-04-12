'use client';

import type { Role } from '@/lib/auth-roles';

const ROLE_COLORS: Record<Role, string> = {
  owner: 'bg-lc-green text-lc-black',
  admin: 'bg-amber-500 text-black',
  mod: 'bg-blue-500 text-white',
  member: 'bg-lc-border text-lc-muted',
};

export interface CustomRoleBadgeData {
  id: string;
  name: string;
  color: string;
  icon?: string | null;
  priority: number;
}

interface RoleBadgeProps {
  role: Role;
  customRoles?: CustomRoleBadgeData[];
}

export default function RoleBadge({ role, customRoles }: RoleBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span
        data-testid="role-badge"
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${ROLE_COLORS[role] || ROLE_COLORS.member}`}
      >
        {role}
      </span>
      {customRoles?.map((cr) => (
        <span
          key={cr.id}
          data-testid="custom-role-badge"
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: cr.color,
            color: isLightColor(cr.color) ? '#000' : '#fff',
          }}
        >
          {cr.icon && <span>{cr.icon}</span>}
          {cr.name}
        </span>
      ))}
    </span>
  );
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
