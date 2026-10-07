'use client';

import { useTranslations } from 'next-intl';
import type { WotStats } from '@/services/settings/wot-stats';

/** The engine's running counts: allowed, denied, still pending. */
export default function WotStatsPanel({ stats }: { stats: WotStats }) {
  const t = useTranslations();
  return (
    <div className="rounded-md border border-lc-border bg-lc-black/40 p-2 text-[11px] font-mono text-lc-muted">
      <div className="flex justify-between">
        <span>{t('settings.wot.resolvedAllow')}</span>
        <span className="text-lc-green">{stats.allow}</span>
      </div>
      <div className="flex justify-between">
        <span>{t('settings.wot.resolvedDeny')}</span>
        <span className="text-red-400">{stats.deny}</span>
      </div>
      <div className="flex justify-between">
        <span>{t('settings.wot.pending')}</span>
        <span className="text-lc-white">{stats.pending}</span>
      </div>
    </div>
  );
}
