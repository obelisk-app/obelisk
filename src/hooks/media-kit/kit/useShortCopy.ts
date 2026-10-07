'use client';

import { useTranslations } from 'next-intl';
import type { MessageKey } from '@/i18n/keys';
import { SHORT_COPY } from '@/constants/media-kit/content';

/**
 * The media kit's quick-use phrases with their text resolved: the brand
 * lines in the page's language, the name and links as they are.
 */
export function useShortCopy(): Array<{ labelKey: MessageKey; value: string }> {
  const t = useTranslations();
  return SHORT_COPY.map((item) => ({
    labelKey: item.labelKey,
    value: 'valueKey' in item ? t(item.valueKey) : item.value,
  }));
}
