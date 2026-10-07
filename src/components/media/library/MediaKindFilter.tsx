'use client';

import { useTranslations } from 'next-intl';
import Chip from '@/components/ui/data/Chip';
import type { MediaFilter } from '@/utils/media/library/types';

const MEDIA_FILTERS: readonly MediaFilter[] = ['all', 'emoji', 'gif', 'sticker'];

/** The kind chips: all, emoji, GIFs, stickers. */
export default function MediaKindFilter({ value, onChange }: { value: MediaFilter; onChange: (next: MediaFilter) => void }) {
  const t = useTranslations();
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-lc-border px-4 py-2" role="group" aria-label={t('media.filterByType')}>
      {MEDIA_FILTERS.map((kind) => (
        <Chip key={kind} onClick={() => onChange(kind)} state={value === kind ? 'selected' : 'idle'}>
          {t(`media.filter.${kind}`)}
        </Chip>
      ))}
    </div>
  );
}
