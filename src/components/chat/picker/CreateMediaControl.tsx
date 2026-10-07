'use client';

import { useRef } from 'react';
import type { JsMediaKind } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/forms/FileInput';

/** The dashed "+ Create" tile: opens a file picker and uploads the image as new media of `kind`. */
export function CreateMediaControl({
  kind,
  square = false,
  uploading,
  onFile,
}: {
  kind: JsMediaKind;
  square?: boolean;
  uploading: boolean;
  onFile: (file: File | undefined, kind: JsMediaKind) => void;
}) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  return <>
    <FileInput
      ref={fileRef}
      accept="image/png,image/jpeg,image/webp,image/gif"
      aria-label={t('media.upload')}
      onChange={(event) => {
        onFile(event.target.files?.[0], kind);
        event.target.value = "";
      }}
    />
    <button
      type="button"
      disabled={uploading}
      onClick={() => fileRef.current?.click()}
      className={(square ? "aspect-square w-full " : "h-full ") + "flex min-h-0 min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border border-dashed border-lc-border bg-lc-card/60 text-lc-white transition-colors hover:border-lc-green/60 hover:text-lc-green disabled:opacity-50"}
      aria-label={t(`chat.mediaPicker.createKind.${kind}`)}
    >
      <span className="text-3xl font-light leading-none" aria-hidden="true">+</span>
      <span className="text-xs">{t(uploading ? 'chat.mediaPicker.creating' : 'chat.mediaPicker.create')}</span>
    </button>
  </>;
}
