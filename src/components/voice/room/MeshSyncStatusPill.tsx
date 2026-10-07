'use client';

import { useTranslations } from 'next-intl';
import PingDot from '@/components/ui/animations/PingDot';

/** The media-sync badge of a mesh call while peer connections are still coming up. */
export default function MeshSyncStatusPill({ count }: { count: number }) {
  const t = useTranslations();
  if (count <= 0) return null;
  const detail = t('voice.meshSyncDetail', { count });
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="mesh-sync-status"
      title={detail}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium leading-none whitespace-nowrap bg-amber-500/15 border-amber-400/40 text-amber-100"
    >
      <PingDot color="bg-amber-300" />
      <span className="hidden sm:inline">{t('voice.mediaSyncing')}</span>
      <span className="sm:hidden">{t('voice.syncing')}</span>
      {count > 1 && <span className="tabular-nums text-amber-50/90">{count}</span>}
    </div>
  );
}
