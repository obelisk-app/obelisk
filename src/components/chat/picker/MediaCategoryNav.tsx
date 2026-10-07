'use client';

import { useTranslations } from 'next-intl';
import type { MediaCategory } from '@/utils/chat/picker/media-catalog';
import { MEDIA_CATEGORIES, MEDIA_CATEGORY_LABEL } from '@/constants/chat/picker';
import { MediaCategoryGlyph } from './MediaCategoryGlyph';

/** The GIF / sticker category bar. */
export function MediaCategoryNav({
  category,
  onCategory,
}: {
  category: MediaCategory;
  onCategory: (value: MediaCategory) => void;
}) {
  const t = useTranslations();
  return (
    <nav className="mb-2 grid shrink-0 grid-cols-9 border-b border-lc-border px-1 pb-1" aria-label={t('chat.mediaPicker.categories')}>
      {MEDIA_CATEGORIES.map((value) => (
        <button
          type="button"
          key={value}
          onClick={() => onCategory(value)}
          aria-label={t(MEDIA_CATEGORY_LABEL[value])}
          aria-pressed={category === value}
          title={t(MEDIA_CATEGORY_LABEL[value])}
          className={['flex h-10 min-w-0 items-center justify-center rounded-lg border-b-2', category === value ? 'border-lc-green bg-lc-green/10 text-lc-green' : 'border-transparent text-lc-white/80 hover:bg-lc-border/60 hover:text-lc-white'].join(' ')}
        >
          <MediaCategoryGlyph category={value} />
        </button>
      ))}
    </nav>
  );
}
