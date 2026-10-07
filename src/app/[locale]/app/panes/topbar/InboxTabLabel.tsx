'use client';

import { useTranslations } from 'next-intl';
import type { InboxTab } from '@/utils/shell/panes/topbar/inbox-tabs';

/** A tab of the bell popover: its name and, when there is any, its unread count. */
export function InboxTabLabel({ tab, selected }: { tab: InboxTab; selected: boolean }) {
  const t = useTranslations();
  return (
    <>
      {tab.key === 'mentions' ? t('shell.inbox.tab.mentions') : t('shell.inbox.tab.dms')}
      {/* Ink-on-green on the selected segment, green-on-ink otherwise. */}
      {tab.count > 0 && (
        <span
          className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none ${
            selected ? 'bg-lc-black text-lc-green' : 'bg-lc-green text-lc-black'
          }`}
        >
          {tab.count > 99 ? '99+' : tab.count}
        </span>
      )}
    </>
  );
}
