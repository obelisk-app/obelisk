'use client';

import { useTranslations } from 'next-intl';

/**
 * Admin / member pill for the channel-settings member list. Replaces a bare
 * 👑 emoji, which carried no label. Distinct from the imported `RoleBadge`,
 * which renders operator-defined relay roles (see docs/features/relay-roles.md).
 */
export function MemberRoleBadge({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations();
  return (
    <span
      className={
        'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ' +
        (isAdmin
          ? 'border-lc-green/40 bg-lc-green/15 text-lc-green'
          : 'border-lc-border text-lc-muted')
      }
    >
      {isAdmin ? t('shell.desktop.members.roleAdmin') : t('shell.desktop.members.roleMember')}
    </span>
  );
}
