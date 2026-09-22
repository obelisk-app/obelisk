'use client';

/**
 * The desktop feed's right-hand column.
 *
 * A wide screen gave the feed one column and ~600px of black either side of
 * it. This puts the space to work with what the feed already knows: which
 * tags the loaded notes are actually about, and whether the relays feeding
 * them are up.
 *
 * Desktop only, by construction — it's rendered inside an `xl:` branch. On a
 * phone this content is a second thing competing with the feed, which is
 * exactly what the filter sheet was built to avoid.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useMemo } from 'react';
import { trendingTags } from '@/lib/social/trending';
import { useTranslation } from '@/i18n/context';

export default function TrendingPanel({
  notes,
  onOpenTag,
}: {
  notes: readonly NostrEvent[];
  onOpenTag?: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const tags = useMemo(() => trendingTags(notes, { limit: 10 }), [notes]);

  return (
    <aside className="w-72 shrink-0 space-y-3 py-3 pr-4" data-testid="feed-trending">
      <section className="rounded-xl border border-lc-border bg-lc-dark/60 p-3">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lc-muted">
          {t('social.trending')}
        </h2>
        {tags.length === 0 ? (
          <p className="text-xs text-lc-muted" data-testid="feed-trending-empty">
            {t('social.trendingEmpty')}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {tags.map(({ tag, count, authors }) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => onOpenTag?.(tag)}
                  className="flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                  data-testid="trending-tag"
                >
                  <span className="min-w-0 truncate text-sm font-medium text-lc-white">#{tag}</span>
                  {/* Notes, not authors: the number people expect next to a tag. */}
                  <span className="shrink-0 text-[11px] tabular-nums text-lc-muted" title={`${authors}`}>
                    {count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

    </aside>
  );
}
