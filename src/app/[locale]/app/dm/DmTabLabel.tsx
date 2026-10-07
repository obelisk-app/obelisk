'use client';

import { useTranslations } from 'next-intl';
import type { DmListTab } from '@/utils/shell/desktop/dm-list';

/** A DM list tab's label: its name and a count badge, which takes the ink colour on the selected segment. */
export function DmTabLabel({ tab, count, active }: { tab: DmListTab; count: number; active: boolean }) {
  const t = useTranslations();
  return (
    <>
      <span>{tab === 'follows' ? t('dm.follows') : t('dm.others')}</span>
      <span
        className={`rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums ${
          active ? 'bg-black/15 text-current' : 'bg-lc-border/60 text-lc-muted'
        }`}
      >
        {count}
      </span>
    </>
  );
}
