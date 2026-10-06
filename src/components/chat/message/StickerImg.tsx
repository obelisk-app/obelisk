'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import MediaLibraryModal from '@/components/media/MediaLibraryModal';
import RemoteImage from '@/components/ui/RemoteImage';
import type { MessageSticker } from '@/utils/media-tags/sticker-tags';
import { useStickerSelection } from '@/hooks/chat/message/useStickerSelection';

export function StickerImg({ sticker }: { sticker: MessageSticker }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const selection = useStickerSelection(sticker);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 block h-44 w-44 max-w-full overflow-hidden rounded-2xl bg-transparent p-1"
        data-testid="message-sticker"
        aria-label={t('chat.sticker.open', { name: sticker.name })}
      >
        <RemoteImage
          src={sticker.url}
          alt={t('chat.sticker.alt', { name: sticker.name })}
          className="block h-full w-full object-contain"
        />
      </button>
      {open && <MediaLibraryModal onClose={() => setOpen(false)} initialSelection={selection} />}
    </>
  );
}
