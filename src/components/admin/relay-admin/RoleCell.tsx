'use client';

import { useTranslations } from 'next-intl';

/** "admin" as a green badge, or a quiet "Member". */
export default function RoleCell({ isAdmin }: { isAdmin: boolean }) {
  const t = useTranslations();
  return isAdmin ? (
    <span className="rounded-full bg-lc-green/20 px-2 py-0.5 text-[10px] font-bold uppercase text-lc-green">
      {t('mobile.members.admin')}
    </span>
  ) : (
    <span className="text-xs text-lc-muted">{t('admin.member')}</span>
  );
}
