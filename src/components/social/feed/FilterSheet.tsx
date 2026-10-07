'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import Text from '@/components/ui/layout/Text';
import { CONTENT_FILTERS, type ContentFilter } from '@/services/social/kinds';
import type { FeedSort } from '@/services/social/rank';
import { useHistoryDismiss } from '@/hooks/common/useHistoryDismiss';

/**
 * The phone's answer to the chip strips.
 *
 * A bottom sheet rather than a dropdown: it's within thumb reach, and the
 * options are big enough to read, which the 11px chips they replace were
 * not.
 */
export default function FilterSheet({
  filter,
  sort,
  mobile,
  onFilter,
  onSort,
  showHighlights,
  onToggleHighlights,
  onClose,
}: {
  filter: ContentFilter;
  sort: FeedSort;
  /** Phone: a bottom sheet within thumb reach. Pane: a dropdown under the button. */
  mobile: boolean;
  onFilter: (value: ContentFilter) => void;
  onSort: (value: FeedSort) => void;
  showHighlights: boolean;
  onToggleHighlights: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  // Back closes the sheet on a phone. A desktop dropdown is dismissed by
  // clicking away, and pushing history for it would make the back button
  // feel like it did nothing.
  const dismiss = useHistoryDismiss(mobile, onClose);

  return (
    <div
      className={mobile
        ? 'fixed inset-0 z-[120] flex flex-col justify-end bg-black/60'
        : 'fixed inset-0 z-[120]'}
      role="dialog"
      aria-modal="true"
      aria-label={t('social.filters')}
      onClick={dismiss}
      data-testid="feed-filter-sheet"
    >
      <div
        className={mobile
          ? 'rounded-t-2xl border-t border-lc-border bg-lc-dark px-4 pb-8 pt-3'
          : 'absolute right-4 top-14 w-72 rounded-xl border border-lc-border bg-lc-dark p-3 shadow-2xl'}
        onClick={(event) => event.stopPropagation()}
        {...(mobile ? { style: { paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' } } : {})}
      >
        {mobile && <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-lc-border" aria-hidden="true" />}

        <Text as="h2" size="11" weight="semibold" variant="label" tone="muted" className="mb-2">
          {t('social.sort.top')} · {t('social.sort.recent')}
        </Text>
        <SegmentedControl
          aria-label={`${t('social.sort.top')} · ${t('social.sort.recent')}`}
          fit="fill"
          className="mb-5"
          value={sort}
          onChange={onSort}
          options={(['recent', 'top'] as const).map((value) => ({
            value,
            label: t(`social.sort.${value}`),
            testId: `feed-sort-${value}`,
          }))}
        />

        <Text as="h2" size="11" weight="semibold" variant="label" tone="muted" className="mb-2">
          {t('social.filters')}
        </Text>
        <div className="grid grid-cols-2 gap-2">
          {CONTENT_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => onFilter(value)}
              className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                filter === value
                  ? 'border-lc-green bg-lc-green/15 text-lc-green'
                  : 'border-lc-border text-lc-muted'
              }`}
              data-testid={`feed-filter-${value}`}
            >
              {t(`social.filter.${value}`)}
            </button>
          ))}
        </div>

        {/*
          Sits under the grid rather than beside the filters: it modifies
          Articles, it isn't a fifth thing to choose between.
        */}
        {filter === 'articles' && (
          <button
            type="button"
            onClick={onToggleHighlights}
            aria-pressed={showHighlights}
            className={`mt-2 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
              showHighlights ? 'border-lc-green bg-lc-green/10' : 'border-lc-border'
            }`}
            data-testid="feed-highlights-toggle"
          >
            <span className="min-w-0">
              <span className={`block text-sm font-semibold ${showHighlights ? 'text-lc-green' : 'text-lc-white'}`}>
                {t('social.highlights')}
              </span>
              <span className="block text-[11px] text-lc-muted">{t('social.highlightsHint')}</span>
            </span>
            <span
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                showHighlights ? 'bg-lc-green' : 'bg-lc-border'
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-lc-black transition-all ${
                  showHighlights ? 'left-[1.125rem]' : 'left-0.5'
                }`}
              />
            </span>
          </button>
        )}

        <Button
          variant="pillSecondary"
          size="sm"
          onClick={dismiss}
          className="mt-5 w-full"
          data-testid="feed-filter-sheet-close"
        >
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
