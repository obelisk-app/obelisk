'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';
import { MenuItem } from '@/components/ui/overlays/menu';
import { CheckIcon } from '@/components/ui/icons/icons';
import Button from '@/components/ui/buttons/Button';
import type { FeedWidgetsModel } from '@/hooks/social/widgets/useFeedWidgets';
import AnchoredMenu from '../../common/AnchoredMenu';

/**
 * The "customize" button under the widget stack and the checklist it opens.
 *
 * It sits under the stack rather than in a panel header: it belongs to the
 * column, not to whichever widget happens to be first.
 */
export default function FeedWidgetsPicker({ options, toggle }: Pick<FeedWidgetsModel, 'options' | 'toggle'>) {
  const t = useTranslations();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/*
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
          {options.map(({ id, on, locked }) => (
            <MenuItem
              key={id}
              role="menuitemcheckbox"
              disabled={locked}
              onClick={() => toggle(id)}
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
          ))}
        </div>
      </AnchoredMenu>
    </>
  );
}
