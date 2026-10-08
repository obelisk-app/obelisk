'use client';

import { useTranslations } from 'next-intl';
import { dismissActivity, type ActivityEntry } from '@/services/feedback/activity-log';
import { CloseIcon } from '@/assets/icons';
import { activityDetail, activityTitle } from '@/utils/errors/activity-text';
import ActivityStatusGlyph from './ActivityStatusGlyph';

const ROW_TONE: Record<ActivityEntry['status'], string> = {
  error: 'border-red-500/40 bg-red-950/80 text-red-100',
  ok: 'border-lc-green/40 bg-lc-card/95 text-lc-white',
  pending: 'border-lc-border bg-lc-card/95 text-lc-white',
};

/** One activity: its glyph, title and detail, and a dismiss icon on a failure. */
export default function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const t = useTranslations();
  const detail = activityDetail(t, entry);
  return (
    <div
      className={
        'pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 text-xs shadow-2xl backdrop-blur ' +
        ROW_TONE[entry.status]
      }
      role={entry.status === 'error' ? 'alert' : 'status'}
    >
      <ActivityStatusGlyph status={entry.status} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold leading-tight">{activityTitle(t, entry)}</div>
        {detail ? (
          <div className="mt-0.5 break-words text-[11px] leading-snug opacity-80">
            {detail}
          </div>
        ) : null}
      </div>
      {entry.status === 'error' ? (
        <button
          type="button"
          onClick={() => dismissActivity(entry.id)}
          className="-mr-1 -mt-0.5 rounded p-0.5 text-red-200/80 hover:bg-red-500/20 hover:text-red-100"
          aria-label={t('common.dismiss')}
        >
          <CloseIcon size={12} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
