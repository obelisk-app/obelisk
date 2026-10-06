'use client';

import { useTranslation } from '@/i18n/context';
import { MEDIA_CATEGORIES, type MediaCategory } from '@/utils/chat/picker/media-catalog';
import { MediaCategoryIcon } from './MediaCategoryIcon';

/** The GIF / sticker category bar. */
export function MediaCategoryNav({
  category,
  onCategory,
}: {
  category: MediaCategory;
  onCategory: (value: MediaCategory) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav className="mb-2 grid shrink-0 grid-cols-9 border-b border-lc-border px-1 pb-1" aria-label={t('mediaPicker.categories')}>
      {MEDIA_CATEGORIES.map((value) => (
        <button
          type="button"
          key={value}
          onClick={() => onCategory(value)}
          aria-label={value}
          aria-pressed={category === value}
          title={value}
          className={['flex h-10 min-w-0 items-center justify-center rounded-lg border-b-2', category === value ? 'border-lc-green bg-lc-green/10 text-lc-green' : 'border-transparent text-lc-white/80 hover:bg-lc-border/60 hover:text-lc-white'].join(' ')}
        >
          <MediaCategoryIcon category={value} />
        </button>
      ))}
    </nav>
  );
}
