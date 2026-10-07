'use client';

import { useTranslations } from 'next-intl';
import type { CategoryUsage } from '@/services/local-data';
import { formatBytes } from '@/utils/format/format-bytes';
import Skeleton from '@/components/ui/animations/Skeleton';

/** How much a category holds: a skeleton while measuring, then empty, a size, or just "present". */
export default function LocalDataUsageLine({ usage, id }: { usage: CategoryUsage | null; id: string }) {
  const t = useTranslations();
  if (!usage) {
    return <Skeleton variant="pulse" className="mt-1.5 h-3 w-16 rounded bg-lc-border" data-testid={`local-data-size-${id}`} />;
  }
  return (
    <div className="mt-1 text-xs text-lc-white/80" data-testid={`local-data-size-${id}`}>
      {!usage.present
        ? t('settings.localData.empty')
        : usage.bytes
          ? t('settings.localData.size', { size: formatBytes(usage.bytes) })
          : t('settings.localData.present')}
    </div>
  );
}
