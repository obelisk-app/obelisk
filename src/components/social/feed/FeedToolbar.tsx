'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Chip from '@/components/ui/data/Chip';
import SegmentedControl from '@/components/ui/forms/SegmentedControl';
import { CONTENT_FILTERS, type ContentFilter } from '@/services/social/kinds';
import type { FeedSort } from '@/services/social/rank';
import { FollowingIcon, GlobeIcon } from './icons';
import type { FeedKind } from '@/services/social/feed';
import Button from '@/components/ui/buttons/Button';

/** Source segment, content filters, sort, and the action cluster on the right. */
export default function FeedToolbar({
  tab,
  onTab,
  followCount,
  relayCount,
  compact,
  embedded,
  filter,
  onFilter,
  sort,
  onSort,
  showHighlights,
  onToggleHighlights,
  onOpenFilters,
  onOpenSearch,
  onOpenSettings,
  actions,
}: {
  tab: FeedKind;
  onTab: (value: FeedKind) => void;
  followCount: number;
  relayCount: number;
  /** Phone or half-width pane: the chips go behind one filter button. */
  compact: boolean;
  embedded: boolean;
  filter: ContentFilter;
  onFilter: (value: ContentFilter) => void;
  sort: FeedSort;
  onSort: (value: FeedSort) => void;
  showHighlights: boolean;
  onToggleHighlights: () => void;
  onOpenFilters: () => void;
  onOpenSearch: () => void;
  onOpenSettings?: () => void;
  actions?: ReactNode;
}) {
  const t = useTranslations();
  return (
    <>
    {/*
      One toolbar, not three stacked rows.
      Source, content filter and actions were each on their own line, so
      the chrome was taller than the first note: you scrolled before you
      read anything. They're one row now: source on the left (what you're
      reading), filters in the middle (what kind), actions pinned right.

      The middle scrolls horizontally rather than wrapping, so a narrow
      split pane shortens the row instead of growing a second line.
    */}
    {/*
      `px-5` like the chat header, and `lc-header-surface` rather than a
      flat `bg-lc-dark`: the shell paints a drifting gradient that the chat
      body and the relay top bar both let through, and an opaque bar here
      made the feed look like a different app bolted into the window.
    */}
    <div className="lc-header-surface flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-lc-border px-5 py-2">
      <h1 className="sr-only">{t('social.feed')}</h1>

      {/*
        The count lives in the tooltip rather than as its own line of text:
        it's context for the choice, not a thing to read.
      */}
      <div className="shrink-0" data-tour="feed-source">
        <SegmentedControl
          aria-label={t('social.feed')}
          value={tab}
          onChange={onTab}
          options={(['following', 'global'] as const).map((value) => ({
            value,
            label: <>{value === 'following' ? <FollowingIcon /> : <GlobeIcon />}{t(`social.${value}`)}</>,
            title: value === 'following'
              ? t('social.followingN', { count: followCount })
              : t('social.relaysCount', { count: relayCount }),
            testId: `feed-tab-${value}`,
          }))}
        />
      </div>

      <div className="mx-1 hidden h-5 w-px shrink-0 bg-lc-border lg:block" aria-hidden="true" />

      {/*
        Narrows the REQ, not just the rendering: asking for 50 mixed
        events and showing the three articles among them is how an
        "Articles" view ends up looking empty.
      */}
      {/*
        Wraps to its own line when it can't fit.
        On one row this had `min-w-0 flex-1`, which let it shrink to zero
        width next to the source pill: on a phone the filters were
        present, sized to nothing, and invisible because the scrollbar is
        hidden. The min-width means the flex container wraps it to a second
        line instead of crushing it, which also covers a narrow split pane
        on a wide screen (a viewport breakpoint would not).
      */}
      {/*
        Desktop keeps the chips inline: there's room, and one tap is
        better than two. On a phone they were a hairline-scrolling strip of
        11px text; they live in the filter sheet instead, and are not
        rendered here at all so the sheet's copies are the only ones.
      */}
      {!compact && <div
        className="-mx-1 order-last flex w-full min-w-0 items-center gap-0.5 overflow-x-auto px-1 lg:order-none lg:w-auto lg:min-w-[13rem] lg:flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label={t('social.filter.all')}
      >
        {CONTENT_FILTERS.map((value) => (
          <Chip
            key={value}
            size="11"
            onClick={() => onFilter(value)}
            state={filter === value ? 'selected' : 'idle'}
            className="shrink-0 font-semibold"
            data-testid={`feed-filter-${value}`}
          >
            {t(`social.filter.${value}`)}
          </Chip>
        ))}
      </div>}

      {/*
        Highlights are hidden by default because one popular article
        produces dozens of overlapping ones and they bury the article
        itself. But they are also how people find good writing, so the
        filter they belong to carries the switch rather than the app
        deciding for everyone.
      */}
      {!compact && filter === 'articles' && (
        <Chip
          size="11"
          onClick={onToggleHighlights}
          state={showHighlights ? 'selected' : 'idle'}
          className="shrink-0 font-semibold"
          title={t('social.highlightsHint')}
          data-testid="feed-highlights-toggle"
        >
          {t('social.highlights')}
        </Chip>
      )}

      {/*
        Sort sits with the filters: both answer "what am I looking at",
        where the source pill answers "whose".
      */}
      {!compact && <div className="flex shrink-0 items-center gap-0.5" role="group">
        {(['recent', 'top'] as const).map((value) => (
          <Chip
            key={value}
            size="11"
            onClick={() => onSort(value)}
            state={sort === value ? 'selected' : 'idle'}
            className="shrink-0 font-semibold"
            data-testid={`feed-sort-${value}`}
          >
            {t(`social.sort.${value}`)}
          </Chip>
        ))}
      </div>}

      {/*
        Pinned right, always, when the toolbar is compact: `lg:ml-0` was
        for the wide layout where the filter chips fill the middle, and in
        a half-width pane on a wide screen it left the actions bunched
        against the source pill with the rest of the row empty.
      */}
      <div className={`ml-auto flex shrink-0 items-center gap-1 ${compact ? '' : 'lg:ml-0'}`}>
        {/*
          One target for "what am I looking at" on a phone, sized like the
          rest of Obelisk's header buttons rather than an 11px chip.
        */}
        {compact && (
          <Button
            variant="toolIcon"
            className={filter !== 'all' || sort !== 'recent' ? '!text-lc-green !border-lc-green/40' : undefined}
            onClick={onOpenFilters}
            aria-label={t('social.filters')}
            title={t('social.filters')}
            data-testid="feed-filters-open"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <path d="M3 5h18" /><path d="M6 12h12" /><path d="M10 19h4" />
            </svg>
          </Button>
        )}
        {/*
          Refresh is gone: pulling up at the top of the feed refreshes, and
          new notes announce themselves with the green pill. A button that
          duplicates a gesture people already make is just chrome.
        */}
        {/*
          Always present, and the same button in every layout. On a wide
          pane it used to be a borderless grey glyph, which is how a
          control people look for ends up looking like it isn't there.
        */}
        <Button
          variant="toolIcon"
          onClick={onOpenSearch}
          aria-label={t('social.search')}
          title={t('social.search')}
          data-testid="feed-search-open"
          data-tour="feed-search"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
        </Button>
        {onOpenSettings && !embedded && (
          <Button
            variant="toolIcon"
            onClick={onOpenSettings}
            aria-label={t('social.relaySettings')}
            title={t('social.relaySettings')}
            data-testid="feed-settings"
          >
            <span className="flex items-center justify-center">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
          </Button>
        )}
        {actions}
      </div>
    </div>
    </>
  );
}
