'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useMemo } from 'react';
import { trendingTags } from '@/lib/social/trending';
import { useTranslation } from '@/i18n/context';
import FollowTagButton from '../FollowTagButton';
import WidgetCard, { WidgetEmpty } from './WidgetCard';

/**
 * What the loaded feed is about, with a way to keep any of it.
 *
 * The follow button is the point of the list rather than a decoration: a
 * trending tag you cannot act on is trivia. It writes NIP-51 kind 10015, so
 * the follow travels to other clients.
 */
export default function TrendingWidget({
  notes,
  onOpenTag,
}: {
  notes: readonly NostrEvent[];
  onOpenTag?: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const tags = useMemo(() => trendingTags(notes, { limit: 8 }), [notes]);

  return (
    <WidgetCard title={t('social.trending')} testId="widget-trending">
      {tags.length === 0 ? (
        <WidgetEmpty testId="feed-trending-empty">{t('social.trendingEmpty')}</WidgetEmpty>
      ) : (
        <ul>
          {tags.map(({ tag, count, authors }) => (
            <li key={tag} className="group/tag flex items-center gap-1 rounded-lg pr-1.5 hover:bg-white/5">
              <button
                type="button"
                onClick={() => onOpenTag?.(tag)}
                className="flex min-w-0 flex-1 items-baseline justify-between gap-2 px-2 py-1.5 text-left"
                data-testid="trending-tag"
              >
                <span className="min-w-0 truncate text-sm font-medium text-lc-white">#{tag}</span>
                {/* Notes, not authors: the number people expect next to a tag. */}
                <span className="shrink-0 text-[11px] tabular-nums text-lc-muted" title={`${authors}`}>
                  {count}
                </span>
              </button>
              {/*
                Revealed on hover so the list reads as tags first. It stays
                visible once followed — that is state, not an affordance.
              */}
              <span className="opacity-0 transition-opacity group-hover/tag:opacity-100 group-focus-within/tag:opacity-100 [&:has([data-following])]:opacity-100">
                <FollowTagButton tag={tag} size="sm" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
