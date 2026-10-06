'use client';

import { useTranslations } from 'next-intl';
import { FileIcon, LockIcon, TrashIcon } from '@/components/ui/icons';
import Spinner from '@/components/ui/Spinner';
import type { PendingFile } from '@/utils/chat/dm/pending';
import IconButton from '@/components/ui/IconButton';

/**
 * The strip of pending attachments above the bar: a local preview of each
 * (never the uploaded ciphertext), a spinner while it encrypts and uploads,
 * a lock once it is ready, and a remove button.
 */
export function DmPendingFiles({
  files,
  variant,
  onRemove,
}: {
  files: ReadonlyArray<PendingFile>;
  variant: 'desktop' | 'mobile';
  onRemove: (id: string) => void;
}) {
  const t = useTranslations();
  if (files.length === 0) return null;
  return (
    <div
      className={variant === 'desktop'
        ? 'mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-lc-border bg-lc-card/50 p-2'
        : 'flex flex-wrap items-center gap-2 px-3 pb-2'}
      data-testid="dm-pending-files"
    >
      {files.map((f) => (
        <div key={f.id} className="group relative h-16 w-16 overflow-hidden rounded-lg bg-lc-black" data-testid="dm-pending-file">
          {f.previewUrl && f.mime.startsWith('image/') ? (
            <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : f.previewUrl && f.mime.startsWith('video/') ? (
            <video src={f.previewUrl} muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-lc-white">
              <FileIcon size={18} />
              <span className="w-full truncate text-center text-[9px]">{f.name}</span>
            </div>
          )}
          {!f.meta && !f.failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55" role="status" aria-label={t('dm.file.uploading')}>
              <Spinner size="sm" />
            </div>
          )}
          {f.failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900/60 text-[10px] font-semibold text-white">!</div>
          )}
          {f.meta && (
            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 p-0.5 text-lc-green" aria-hidden="true">
              <LockIcon size={10} />
            </span>
          )}
          <IconButton
            tone="overlay"
            size="5"
            onClick={() => onRemove(f.id)}
            className="absolute right-0.5 top-0.5"
            aria-label={t('shell.desktop.composer.removeAttachment')}
          >
            <TrashIcon size={11} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}
