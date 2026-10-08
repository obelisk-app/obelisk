'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import type { CategoryUsage, LocalDataCategory } from '@/services/local-data';
import LocalDataUsageLine from './LocalDataUsageLine';
import Text from '@/components/ui/layout/Text';

/** One category of local data: what it is for, how much there is, and its Remove. */
export default function LocalDataCategoryRow({ category, usage, busy, onRemove }: {
  category: LocalDataCategory;
  usage: CategoryUsage | null;
  busy: string | null;
  onRemove: () => void;
}) {
  const t = useTranslations();
  return (
    <li className="flex items-start justify-between gap-4 p-3" data-testid={`local-data-row-${category.id}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-lc-white">{t(category.titleKey)}</div>
        <Text as="p" variant="caption" className="mt-0.5 leading-5">{t(category.purposeKey)}</Text>
        <LocalDataUsageLine usage={usage} id={category.id} />
      </div>
      <Button
        variant="outline"
        tone="danger"
        size="sm"
        className="shrink-0"
        onClick={onRemove}
        disabled={busy !== null || !usage?.present}
        data-testid={`local-data-remove-${category.id}`}
      >
        {busy === category.id ? t('settings.localData.removing') : t('settings.localData.remove')}
      </Button>
    </li>
  );
}
