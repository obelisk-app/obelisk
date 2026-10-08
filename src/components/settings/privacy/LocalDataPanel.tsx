'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import Link from '@/components/ui/navigation/Link';
import Button from '@/components/ui/buttons/Button';
import AnalyticsSetting from './AnalyticsSetting';
import LocalDataCategoryRow from './LocalDataCategoryRow';
import { useClearLocalData } from '@/hooks/shell/settings/useClearLocalData';
import Text from '@/components/ui/layout/Text';
import Heading from '@/components/ui/layout/Heading';

/**
 * Settings > Data on this device, on both shells: every category of local
 * data with what it is for and roughly how much it takes, a Remove per
 * category, and "Remove everything from this device". The copy of each
 * category is the help page's (`help.localData.categories.*`). Above the
 * list, the Google Analytics answer, which can be changed here at any time.
 */
export default function LocalDataPanel({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const { categories, usage, busy, removeCategory, removeAll } = useClearLocalData();

  return (
    <div className={mobile ? 'space-y-3 px-4 py-3' : 'space-y-4'} data-testid="local-data-panel">
      <Text as="p" variant="muted" className="leading-6">{t('settings.localData.intro')}</Text>
      <AnalyticsSetting />
      <ul className="divide-y divide-lc-border overflow-hidden rounded-lg border border-lc-border">
        {categories.map((category) => (
          <LocalDataCategoryRow
            key={category.id}
            category={category}
            usage={usage ? usage[category.id] : null}
            busy={busy}
            onRemove={() => void removeCategory(category.id)}
          />
        ))}
      </ul>
      <Card as="section" surface="transparent" radius="lg" tone="danger" data-testid="local-data-everything">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Heading as="h3" variant="panel">{t('settings.localData.removeAll.title')}</Heading>
            <Text as="p" variant="caption" className="mt-0.5 leading-5">{t('settings.localData.removeAll.description')}</Text>
          </div>
          <Button
            variant="danger"
            size="sm"
            className="shrink-0 px-3 py-1.5"
            onClick={() => void removeAll()}
            disabled={busy !== null}
            data-testid="local-data-remove-all"
          >
            {busy === 'all' ? t('settings.localData.removing') : t('settings.localData.removeAll.button')}
          </Button>
        </div>
      </Card>
      <Link href="/help/local-data" variant="text" className="inline-block text-sm" data-testid="local-data-learn-more">
        {t('settings.localData.learnMore')}
      </Link>
    </div>
  );
}
