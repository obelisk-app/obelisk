'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import type { WotStats } from '@/services/settings/wot-stats';

/** The engine's running counts: allowed, denied, still pending. */
export default function WotStatsPanel({ stats }: { stats: WotStats }) {
  const t = useTranslations();
  return (
    <Card surface="translucent" radius="md" padding="sm" className="text-[11px] font-mono text-lc-muted">
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
    </Card>
  );
}
