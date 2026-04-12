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
  maxCustom?: number;
  onOverflowClick?: () => void;
}

function isIconUrl(icon: string): boolean {
  return /^(https?:)?\/\//i.test(icon) || icon.startsWith('/');
}

export default function RoleBadge({ role, customRoles, maxCustom, onOverflowClick }: RoleBadgeProps) {
  const all = customRoles ?? [];
  const visible = typeof maxCustom === 'number' ? all.slice(0, maxCustom) : all;
  const overflow = all.length - visible.length;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span
        data-testid="role-badge"
        className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${ROLE_COLORS[role] || ROLE_COLORS.member}`}
      >
        {role}
      </span>
      {visible.map((cr) => (
        <span
          key={cr.id}
          data-testid="custom-role-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold max-w-[12rem]"
          style={{
            backgroundColor: cr.color,
            color: isLightColor(cr.color) ? '#000' : '#fff',
          }}
        >
          {cr.icon && (
            isIconUrl(cr.icon) ? (
              <img src={cr.icon} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
            ) : (
              <span>{cr.icon}</span>
            )
          )}
          <span className="truncate">{cr.name}</span>
        </span>
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={onOverflowClick}
          data-testid="custom-role-overflow"
          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-lc-border/60 text-lc-white hover:bg-lc-border transition-colors"
          title="Edit roles"
        >
          +{overflow}
        </button>
      )}
    </span>
  );
}

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}
