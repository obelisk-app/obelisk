'use client';

/**
 * A thread or an article, opened in place of the feed rather than on top of
 * it.
 *
 * Threads and articles used to open in a modal whenever the host had no
 * pane to hand them to — on a phone, in a split pane, on a profile. A modal
 * is the wrong shape for both: an article is a page of prose that wants the
 * full column and its own scrollbar, and a thread is a conversation you
 * scroll and reply in. Boxing either inside a centred card with a dimmed
 * backdrop gave it less room than the feed it came from and made the feed
 * behind it look reachable when it wasn't.
 *
 * This takes over the surface it was opened from, with the back control
 * where the reader already looks for it, and the OS back gesture wired to
 * the same exit.
 */

import { useHistoryDismiss } from '@/app/app/useHistoryDismiss';
import { useTranslation } from '@/i18n/context';

export default function InlineReader({
  title,
  onBack,
  children,
  testId = 'inline-reader',
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  const dismiss = useHistoryDismiss(true, onBack);

  return (
    <div className="flex h-full min-h-0 flex-col bg-lc-black" data-testid={testId}>
      {/* `h-14`/`px-5`: the app's header contract, same as every other one. */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-lc-border bg-lc-dark px-5">
        <button
          type="button"
          onClick={dismiss}
          className="-ml-1 flex h-8 w-8 items-center justify-center rounded-full text-lc-white/70 transition-colors hover:bg-white/10 hover:text-lc-white"
          aria-label={t('common.back')}
          title={t('common.back')}
          data-testid="inline-reader-back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-lc-white">{title}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
