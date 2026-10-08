'use client';

import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { CloseIcon } from '@/assets/icons';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** The images about to be sent, each removable, and a placeholder tile while an upload runs. */
export function ComposerAttachments({ urls, uploading, onRemove }: {
  urls: ReadonlyArray<string>;
  uploading: boolean;
  onRemove: (url: string) => void;
}) {
  const t = useTranslations();
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-lc-border bg-lc-card/50 p-2">
      {urls.map((url) => (
        <div key={url} className="group relative h-16 w-16 overflow-hidden rounded-lg bg-lc-black">
          <RemoteImage src={url} alt="" className="h-full w-full object-cover" />
          <Button
            variant="bare"
            type="button"
            onClick={() => onRemove(url)}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-[11px] text-lc-white opacity-90 hover:bg-black"
            aria-label={t('shell.desktop.composer.removeAttachment')}
          >
            <CloseIcon size={12} strokeWidth={2.5} />
          </Button>
        </div>
      ))}
      {uploading && (
        <Text as="div" variant="label" size="10" tone="muted" className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-lc-border">
          …
        </Text>
      )}
    </div>
  );
}
