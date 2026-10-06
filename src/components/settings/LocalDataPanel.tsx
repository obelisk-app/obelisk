'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import Button from '@/components/ui/Button';
import { useClearLocalData } from '@/hooks/app/settings/useClearLocalData';
import type { CategoryUsage, LocalDataCategory } from '@/services/local-data';
import { formatBytes } from '@/utils/format/format-bytes';

/**
 * Settings > Data on this device, on both shells: every category of local
 * data with what it is for and roughly how much it takes, a Remove per
 * category, and "Remove everything from this device". The copy of each
 * category is the help page's (`help.localData.categories.*`).
 */
export default function LocalDataPanel({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const { categories, usage, busy, removeCategory, removeAll } = useClearLocalData();

  return (
    <div className={mobile ? 'space-y-3 px-4 py-3' : 'space-y-4'} data-testid="local-data-panel">
      <p className="text-sm leading-6 text-lc-muted">{t('settings.localData.intro')}</p>
      <ul className="divide-y divide-lc-border overflow-hidden rounded-lg border border-lc-border">
        {categories.map((category) => (
          <CategoryRow
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

function CategoryRow({ category, usage, busy, onRemove }: {
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
        <p className="mt-0.5 text-xs leading-5 text-lc-muted">{t(category.purposeKey)}</p>
        <UsageLine usage={usage} id={category.id} />
      </div>
      <Button
        variant="outline"
        tone="danger"
        size="sm"
        className="shrink-0 px-3 py-1"
        onClick={onRemove}
        disabled={busy !== null || !usage?.present}
        data-testid={`local-data-remove-${category.id}`}
      >
        {busy === category.id ? t('settings.localData.removing') : t('settings.localData.remove')}
      </Button>
    </li>
  );
}

function UsageLine({ usage, id }: { usage: CategoryUsage | null; id: string }) {
  const t = useTranslations();
  if (!usage) {
    return <div className="mt-1.5 h-3 w-16 animate-pulse rounded bg-lc-border" data-testid={`local-data-size-${id}`} />;
  }
  const text = !usage.present
    ? t('settings.localData.empty')
    : usage.bytes
      ? t('settings.localData.size', { size: formatBytes(usage.bytes) })
      : t('settings.localData.present');
  return <div className="mt-1 text-xs text-lc-white/80" data-testid={`local-data-size-${id}`}>{text}</div>;
}
