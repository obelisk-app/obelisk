'use client';

/**
 * Stands in for sender-chosen media the reader has not asked to load. See
 * `src/services/media/remote-media.ts` for why: fetching an `<img src>` tells its host
 * the reader's IP address. One tap loads this message's media.
 *
 * A `<button>` so it is valid wherever an image was (including inside a
 * paragraph) and reachable from the keyboard.
 */

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { ImageIcon } from '@/assets/icons';

export function RemoteMediaPlaceholder({ onReveal, compact = false }: { onReveal: () => void; compact?: boolean }) {
  const t = useTranslations();
  return (
    <Button
      variant="outline"
      size={compact ? 'xs' : 'sm'}
      onClick={onReveal}
      className="mt-1 max-w-sm text-left"
      data-testid="remote-media-placeholder"
    >
      <ImageIcon size={null} className="h-5 w-5 shrink-0 text-lc-white" />
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-lc-white">{t('media.remote.show')}</span>
        {!compact && <span className="text-xs text-lc-muted">{t('media.remote.hint')}</span>}
      </span>
    </Button>
  );
}
