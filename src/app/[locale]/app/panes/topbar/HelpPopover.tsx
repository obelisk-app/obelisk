'use client';

import { createPortal } from 'react-dom';
import Button from '@/components/ui/buttons/Button';
import { BookIcon, SparklesIcon } from '@/assets/icons';
import { guidePath } from '@/utils/guides/guide-urls';
import { localizedPath } from '@/utils/seo/alternates';
import { HELP_TOPICS, helpTopicPath } from '@/utils/guides/help-topics';
import { useTranslations } from 'next-intl';
import { useHelpPopover } from '@/hooks/shell/panes/topbar/useHelpPopover';
import { HelpTopicBadge } from './HelpTopicBadge';

/**
 * Help panel, deliberately the same shell as the notification popover
 * (width, radius, border, shadow) so the top-right corner reads as one
 * family of panels. Replaces the old hard link to /help, which threw the
 * user out of the chat to read a few cards; the full page still exists
 * behind "view more".
 */
export function HelpPopover({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const vm = useHelpPopover(onClose);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      data-help-popover
      data-testid="help-popover"
      className="fixed right-2 md:right-3 top-[3.75rem] md:top-11 z-[60] w-[min(380px,calc(100vw-1rem))] max-h-[70vh] overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-2xl flex flex-col"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-lc-border">
        <span className="text-sm font-semibold text-lc-white">{t('common.help')}</span>
      </div>
      {/* One `lc-card` per topic, the same card treatment the /help
          page gives these, just at popover scale. Flat list rows
          read as a menu; discrete cards match where the user has seen
          this content before.

          The well is `lc-black` because `.lc-card` paints #171717, the
          exact colour of the popover's own `bg-lc-dark`, on that
          background the cards would be invisible apart from their
          border. Recessing the scroll area reproduces the page/card
          contrast /help gets for free from the black page behind it. */}
      <div className="overflow-y-auto flex-1 bg-lc-black/50 p-3">
        <ul className="flex flex-col gap-2">
          {HELP_TOPICS.map((topic) => (
            <li key={topic.slug}>
              <a
                href={localizedPath(vm.locale, helpTopicPath(topic))}
                data-testid={`help-popover-topic-${topic.slug}`}
                onClick={onClose}
                className="lc-card group flex items-start gap-3 p-3 hover:border-lc-green/50"
              >
                <HelpTopicBadge slug={topic.slug} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-lc-white group-hover:text-lc-green">
                    {t(topic.titleKey)}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-lc-muted">
                    {t(topic.descriptionKey)}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-2 border-t border-lc-border px-4 py-3">
        <a
          href={localizedPath(vm.locale, guidePath())}
          data-testid="help-popover-view-more"
          onClick={onClose}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-lc-green/40 bg-lc-green/10 px-4 py-2 text-xs font-semibold text-lc-green transition-colors hover:border-lc-green/70 hover:bg-lc-green/20"
        >
          <BookIcon size={14} />
          {t('help.viewMore')}
        </a>
        {/*
          The in-app hints are one-shot by design, so this is the only
          way back to them, and the only honest place for it is where
          someone already goes when they want to be told something.
        */}
        <Button
          variant="outlinePill"
          size="xs"
          onClick={vm.replayHints}
          className="w-full"
          data-testid="help-popover-replay-hints"
        >
          <SparklesIcon size={14} />
          {t('shell.hints.replay')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
