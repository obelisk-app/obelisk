'use client';

/**
 * Floating bottom-right control inside the channel message viewport.
 *
 * Two stacked widgets:
 *   - Mention/reply nav: `↑ N ↓`: when there are unread mentions or
 *     replies in this channel, lets the user step through them in
 *     chronological order. Keyboard parity with Discord: `F7` next,
 *     `Shift+F7` previous.
 *   - Jump-to-latest: appears only when the user is scrolled away from
 *     the bottom; clicking snaps the scroller down (which also lets the
 *     auto-mark hook advance the cursor).
 *
 * The scroll target uses the existing `data-msg-id` attribute on each
 * rendered message: same convention as the deep-link "jump to message"
 * path in `DesktopShell.tsx`. Highlighting matches: a brief
 * `ring-1 ring-lc-green` flash on the focused row.
 */

import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import { useMentionNavigation } from '@/hooks/chat/mentions/useMentionNavigation';
import IconButton from '@/components/ui/IconButton';

export interface MentionNavigatorProps {
  /** Scroll container ref: the same `scrollRef` the message list uses. */
  readonly scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Event ids of unread mentions/replies, oldest→newest. May be empty. */
  readonly eventIds: ReadonlyArray<string>;
}

export default function MentionNavigator({ scrollRef, eventIds }: MentionNavigatorProps) {
  const { t } = useTranslation();
  const { index, showJumpToLatest, goNext, goPrev, jumpToLatest } = useMentionNavigation(scrollRef, eventIds);

  const hasHighlights = eventIds.length > 0;

  if (!hasHighlights && !showJumpToLatest) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-30 flex flex-col items-end gap-2">
      {hasHighlights && (
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full border border-lc-border bg-lc-dark/90 px-2 py-1 text-xs text-lc-white shadow-lg backdrop-blur"
          role="group"
          aria-label={t('mentions.navigation')}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrev}
            disabled={index === 0}
            aria-label={t('mentions.previousTitle')}
            title={t('mentions.previous')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </Button>
          <span className="px-1 tabular-nums">
            <span className="font-semibold text-lc-green">{index + 1}</span>
            <span className="mx-1 text-lc-muted">/</span>
            <span>{eventIds.length}</span>
            <span className="ml-1 text-lc-muted">{eventIds.length === 1 ? 'mention' : 'mentions'}</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={goNext}
            disabled={index >= eventIds.length - 1}
            aria-label={t('mentions.nextTitle')}
            title={t('mentions.next')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </Button>
        </div>
      )}
      {showJumpToLatest && (
        <IconButton
          tone="outline"
          onClick={jumpToLatest}
          className="pointer-events-auto shadow-lg backdrop-blur"
          aria-label={t('mentions.latestTitle')}
          title={t('mentions.latest')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </IconButton>
      )}
    </div>
  );
}
