'use client';

/**
 * Stands in for sender-chosen media the reader has not asked to load. See
 * `src/services/remote-media.ts` for why: fetching an `<img src>` tells its host
 * the reader's IP address. One tap loads this message's media.
 *
 * A `<button>` so it is valid wherever an image was (including inside a
 * paragraph) and reachable from the keyboard.
 */

import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';

export function RemoteMediaPlaceholder({ onReveal, compact = false }: { onReveal: () => void; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      size={compact ? 'xs' : 'sm'}
      onClick={onReveal}
      className="mt-1 max-w-sm text-left"
      data-testid="remote-media-placeholder"
    >
      <svg className="h-5 w-5 shrink-0 text-lc-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="m21 15-4.5-4.5L9 18" />
      </svg>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-lc-white">{t('media.remote.show')}</span>
        {!compact && <span className="text-xs text-lc-muted">{t('media.remote.hint')}</span>}
      </span>
    </Button>
  );
}
