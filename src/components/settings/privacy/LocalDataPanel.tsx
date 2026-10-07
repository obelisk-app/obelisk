'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Button from '@/components/ui/buttons/Button';
import AnalyticsSetting from './AnalyticsSetting';
import LocalDataCategoryRow from './LocalDataCategoryRow';
import { useClearLocalData } from '@/hooks/shell/settings/useClearLocalData';

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
      <p className="text-sm leading-6 text-lc-muted">{t('settings.localData.intro')}</p>
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
      <section className="rounded-lg border border-red-500/30 p-3" data-testid="local-data-everything">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-lc-white">{t('settings.localData.removeAll.title')}</h3>
            <p className="mt-0.5 text-xs leading-5 text-lc-muted">{t('settings.localData.removeAll.description')}</p>
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
      </section>
      <Link href="/help/local-data" className="inline-block text-sm text-lc-green hover:underline" data-testid="local-data-learn-more">
        {t('settings.localData.learnMore')}
      </Link>
    </div>
  );
}
