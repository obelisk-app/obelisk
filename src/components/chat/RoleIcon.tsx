'use client';

import type { MemberInfo, MemberCustomRoleInfo } from '@/lib/mentions';

const BASE_ROLE_PRIORITY: Record<string, number> = {
  owner: 400,
  admin: 300,
  mod: 200,
  member: 100,
};

const BASE_ROLE_DEFAULT: Record<string, { icon: string; label: string }> = {
  owner: { icon: '👑', label: 'Owner' },
  admin: { icon: '🛡️', label: 'Admin' },
  mod: { icon: '🔧', label: 'Moderador' },
};

function isIconUrl(icon: string): boolean {
  return /^(https?:)?\/\//i.test(icon) || icon.startsWith('/');
}

interface TopRole {
  icon: string;
  label: string;
}

/**
 * Picks the highest-priority role for display. A custom role wins over the
 * generic "member" tier; for staff it only wins if its priority exceeds the
 * base priority — matching MemberList's grouping logic.
 */
function pickTopRole(role: string | undefined, customRoles: MemberCustomRoleInfo[] | undefined): TopRole | null {
  const topCustom = customRoles?.length
    ? customRoles.reduce((best, cr) => (cr.priority > best.priority ? cr : best), customRoles[0])
    : null;
  const base = role ?? 'member';
  const basePriority = BASE_ROLE_PRIORITY[base] ?? 100;
  const baseIsMember = base === 'member';
  const customWins = topCustom && (baseIsMember || topCustom.priority > basePriority);

  if (customWins && topCustom) {
    if (topCustom.icon) return { icon: topCustom.icon, label: topCustom.name };
    // Custom role wins but has no icon — fall back to base default if any.
    const baseDefault = BASE_ROLE_DEFAULT[base];
    return baseDefault ? { icon: baseDefault.icon, label: topCustom.name } : null;
  }

  const baseDefault = BASE_ROLE_DEFAULT[base];
  return baseDefault ? { icon: baseDefault.icon, label: baseDefault.label } : null;
}

interface RoleIconProps {
  member?: Pick<MemberInfo, 'role' | 'customRoles'> | null;
  className?: string;
}

export default function RoleIcon({ member, className }: RoleIconProps) {
  if (!member) return null;
  const top = pickTopRole(member.role, member.customRoles);
  if (!top) return null;

  const size = 'w-4 h-4';
  return (
    <span
      title={top.label}
      aria-label={`Rol: ${top.label}`}
      data-testid="role-icon"
      className={`inline-flex items-center shrink-0 ${className ?? ''}`}
    >
      {isIconUrl(top.icon) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={top.icon} alt="" className={`${size} object-contain`} />
      ) : (
        <span className="text-sm leading-none">{top.icon}</span>
      )}
    </span>
  );
}
