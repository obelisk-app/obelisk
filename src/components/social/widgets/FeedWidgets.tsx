'use client';

/**
 * The desktop feed's right-hand column.
 *
 * A wide screen gave the feed one column and ~600px of black either side of
 * it. This puts the space to work with what the feed already knows, and
 * which panels appear is the reader's call, because the one panel that used
 * to live here (trending tags) is not the one everybody wants.
 *
 * Desktop only, by construction: it is rendered inside an `xl:` branch. On a
 * phone this content is a second thing competing with the feed, which is
 * exactly what the filter sheet was built to avoid.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { useRef, useState } from 'react';
import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import {
  FEED_WIDGETS,
  normalizeFeedWidgets,
  toggleFeedWidget,
  type FeedWidgetId,
} from '@/services/social/widgets';
import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';
import { MenuItem } from '@/components/ui/overlays/menu';
import { CheckIcon } from '@/components/ui/icons/icons';
import AnchoredMenu from '../../common/AnchoredMenu';
import TrendingWidget from './TrendingWidget';
import WhoToFollowWidget from './WhoToFollowWidget';
import FollowedTagsWidget from './FollowedTagsWidget';
import RelaysWidget from './RelaysWidget';
import Button from '@/components/ui/buttons/Button';

export default function FeedWidgets({
  notes,
  onOpenTag,
  onOpenProfile,
}: {
  notes: readonly NostrEvent[];
  onOpenTag?: (tag: string) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
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
        of reach: the control that changes how many widgets there are must
        not be the thing that disappears when you add one.
      */}
      {/*
        Blur, not a painted gradient.

        This was `bg-gradient-to-t from-lc-black`, a flat fill over a page
        whose background is a tinted radial gradient, so it read as a dark
        rectangle floating behind the button rather than a fade. Blurring
        what is actually behind works against any background, including the
        user's own `backgroundColor`.
      */}
      <div className="sticky bottom-0 -mx-1 px-1 pb-1 pt-3 backdrop-blur-sm">
        <Button
          variant="outline"
          size="xs"
          ref={pickerRef}
          onClick={() => setPickerOpen((open) => !open)}
          // Solid border: the dashed one was the only dashed control in the
          // app and read as a placeholder rather than a button.
          className="w-full"
          aria-expanded={pickerOpen}
          data-testid="feed-widgets-picker"
        >
          {t('social.widgets.customize')}
        </Button>
      </div>

      <AnchoredMenu
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchorRef={pickerRef}
        width={272}
        testId="feed-widgets-menu"
      >
        <div className="p-1">
          <Text as="p" size="10" weight="semibold" variant="label" tone="muted" className="px-2.5 pb-1 pt-2">
            {t('social.widgets.title')}
          </Text>
          {FEED_WIDGETS.map((id) => {
            const on = selected.includes(id);
            // The last one on can't be switched off: an empty column reads
            // as a bug rather than as a choice.
            const locked = on && selected.length === 1;
            return (
              <MenuItem
                key={id}
                role="menuitemcheckbox"
                disabled={locked}
                onClick={() => setPreference('feedWidgets', toggleFeedWidget(selected, id))}
                testId="feed-widget-option"
                buttonProps={{ 'aria-checked': on, 'data-widget': id, 'data-on': on || undefined }}
                icon={(
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      on ? 'border-lc-green bg-lc-green text-lc-black' : 'border-lc-border text-transparent'
                    }`}
                  >
                    <CheckIcon size={11} />
                  </span>
                )}
                label={t(`social.widgets.${id}`)}
              />
            );
          })}
        </div>
      </AnchoredMenu>
    </aside>
  );
}
