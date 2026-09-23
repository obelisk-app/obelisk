'use client';

/**
 * The desktop feed's right-hand column.
 *
 * A wide screen gave the feed one column and ~600px of black either side of
 * it. This puts the space to work with what the feed already knows — and
 * which panels appear is the reader's call, because the one panel that used
 * to live here (trending tags) is not the one everybody wants.
 *
 * Desktop only, by construction: it is rendered inside an `xl:` branch. On a
 * phone this content is a second thing competing with the feed, which is
 * exactly what the filter sheet was built to avoid.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useRef, useState } from 'react';
import { setPreference, usePreferences } from '@/lib/preferences';
import {
  FEED_WIDGETS,
  normalizeFeedWidgets,
  toggleFeedWidget,
  type FeedWidgetId,
} from '@/lib/social/widgets';
import { useTranslation } from '@/i18n/context';
import AnchoredMenu from './AnchoredMenu';
import TrendingWidget from './widgets/TrendingWidget';
import WhoToFollowWidget from './widgets/WhoToFollowWidget';
import FollowedTagsWidget from './widgets/FollowedTagsWidget';
import RelaysWidget from './widgets/RelaysWidget';

export default function FeedWidgets({
  notes,
  onOpenTag,
  onOpenProfile,
}: {
  notes: readonly NostrEvent[];
  onOpenTag?: (tag: string) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  const selected = normalizeFeedWidgets(usePreferences().feedWidgets);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);

  const render = (id: FeedWidgetId) => {
    switch (id) {
      case 'trending':
        return <TrendingWidget key={id} notes={notes} onOpenTag={onOpenTag} />;
      case 'who-to-follow':
        return <WhoToFollowWidget key={id} notes={notes} onOpenProfile={onOpenProfile} />;
      case 'followed-tags':
        return <FollowedTagsWidget key={id} onOpenTag={onOpenTag} />;
      case 'relays':
        return <RelaysWidget key={id} />;
      default:
        return null;
    }
  };

  return (
    <aside className="w-72 shrink-0 space-y-3 py-3 pr-4" data-testid="feed-trending">
      {selected.map(render)}

      {/*
        The picker sits under the stack rather than in a panel header: it
        belongs to the column, not to whichever widget happens to be first.

        Stuck to the bottom of the column so a full stack can't push it out
        of reach — the control that changes how many widgets there are must
        not be the thing that disappears when you add one.
      */}
      <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-lc-black via-lc-black/90 to-transparent px-1 pb-1 pt-3">
        <button
          ref={pickerRef}
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="w-full rounded-xl border border-dashed border-lc-border bg-lc-dark/60 px-3 py-2 text-[11px] font-medium text-lc-muted backdrop-blur-sm transition-colors hover:border-lc-green/40 hover:text-lc-white"
          aria-expanded={pickerOpen}
          data-testid="feed-widgets-picker"
        >
          {t('social.widgets.customize')}
        </button>
      </div>

      <AnchoredMenu
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchorRef={pickerRef}
        width={272}
        testId="feed-widgets-menu"
      >
        <div className="p-1">
          <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
            {t('social.widgets.title')}
          </p>
          {FEED_WIDGETS.map((id) => {
            const on = selected.includes(id);
            // The last one on can't be switched off — an empty column reads
            // as a bug rather than as a choice.
            const locked = on && selected.length === 1;
            return (
              <button
                key={id}
                type="button"
                disabled={locked}
                onClick={() => setPreference('feedWidgets', toggleFeedWidget(selected, id))}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-lc-white hover:bg-white/5 disabled:opacity-50"
                role="menuitemcheckbox"
                aria-checked={on}
                data-testid="feed-widget-option"
                data-widget={id}
                data-on={on || undefined}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    on ? 'border-lc-green bg-lc-green text-lc-black' : 'border-lc-border text-transparent'
                  }`}
                  aria-hidden="true"
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1 truncate">{t(`social.widgets.${id}`)}</span>
              </button>
            );
          })}
        </div>
      </AnchoredMenu>
    </aside>
  );
}
