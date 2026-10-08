'use client';

import Link from '@/components/ui/navigation/Link';

/**
 * Renders a NIP-17 kind-15 file message: fetch the ciphertext from Blossom,
 * check it against `x`, decrypt it in memory and show it from an object URL.
 *
 * Nothing decrypted touches disk: the object URL lives only as long as this
 * component and is revoked on unmount (docs/direct-messages.md: no DM
 * plaintext on disk). Images, video and audio decrypt as soon as they mount;
 * any other file type waits for a click, because it can only be downloaded
 * and there is no reason to pull a 25 MB zip the reader may never want.
 */

import Row from '@/components/ui/layout/Row';
import Button from '@/components/ui/buttons/Button';
import { dmFileCategory, type JsDmFile } from '@/utils/attachments/dm-file';
import { useDecryptedDmFile } from '@/hooks/chat/dm/message/useDecryptedDmFile';
import { formatBytes } from '@/utils/format/format-bytes';
import { useTranslations } from 'next-intl';
import { DownloadIcon, FileIcon, LockIcon } from '@/assets/icons';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { VoiceMessage } from '@/components/chat/message/VoiceMessage';
import TextButton from '@/components/ui/buttons/TextButton';
import Skeleton from '@/components/ui/animations/Skeleton';

export function EncryptedDmAttachment({ file, onAccent = false }: { file: JsDmFile; onAccent?: boolean }) {
  const t = useTranslations();
  const category = dmFileCategory(file.mimeType);
  const media = category !== 'file';
  const { state, load } = useDecryptedDmFile(file, media);
  const muted = onAccent ? 'text-black/60' : 'text-lc-muted';

  if (state.status === 'error') {
    return (
      <div className="flex items-center gap-2 text-xs text-red-500" data-testid="dm-file-error" role="alert">
        <LockIcon size={14} />
        <span>{state.integrity ? t('dm.file.integrity') : t('dm.file.failed')}</span>
        {!state.integrity && (
          <TextButton tone="plain" onClick={load} className="font-semibold underline">
            {t('common.retry')}
          </TextButton>
        )}
      </div>
    );
  }

  if (media) {
    if (state.status !== 'ready') {
      const aspect = file.dim ? `${file.dim.width} / ${file.dim.height}` : undefined;
      return (
        <Skeleton
          className="flex min-h-24 w-64 max-w-full items-center justify-center rounded-lg"
          style={{ aspectRatio: category === 'image' ? aspect : undefined }}
          data-testid="dm-file-loading"
          role="status"
          aria-label={t('dm.file.decrypting')}
        >
          <LockIcon size={18} className={muted} />
        </Skeleton>
      );
    }
    if (category === 'image') {
      return (
        <Link native href={state.url} target="_blank" rel="noopener noreferrer" data-testid="dm-file-image">
          <RemoteImage src={state.url} alt={file.name ?? t('dm.file.attachment')} className="max-h-80 max-w-full rounded-lg" />
        </Link>
      );
    }
    if (category === 'video') {
      return <video src={state.url} controls className="max-h-80 max-w-full rounded-lg" data-testid="dm-file-video" />;
    }
    // A recorded voice note gets the same waveform bubble as in a channel;
    // any other audio file is just a player.
    if (typeof file.durationSeconds === 'number') {
      return (
        <div data-testid="dm-file-voice">
          <VoiceMessage note={{ url: state.url, durationSeconds: file.durationSeconds }} compact />
        </div>
      );
    }
    return <audio src={state.url} controls className="max-w-full" data-testid="dm-file-audio" />;
  }

  const label = file.name ?? t('dm.file.attachment');
  return (
    <Row gap="3" align="center" data-testid="dm-file-card">
      <FileIcon size={22} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{label}</div>
        <div className={'flex items-center gap-1 text-[11px] ' + muted}>
          <LockIcon size={11} />
          <span>{[t('dm.file.attachment'), formatBytes(file.size)].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      {state.status === 'ready' ? (
        <Link native
          href={state.url}
          download={file.name ?? 'file'}
          className="flex items-center gap-1 rounded-full border border-current px-3 py-1 text-xs font-semibold"
          data-testid="dm-file-save"
        >
          <DownloadIcon size={14} />
          {t('dm.file.download')}
        </Link>
      ) : (
        <Button
          variant="bare"
          type="button"
          onClick={load}
          disabled={state.status === 'loading'}
          className="flex items-center gap-1 rounded-full border border-current px-3 py-1 text-xs font-semibold disabled:opacity-60"
          data-testid="dm-file-decrypt"
        >
          <DownloadIcon size={14} />
          {state.status === 'loading' ? t('dm.file.decrypting') : t('dm.file.open')}
        </Button>
      )}
    </Row>
  );
}
