'use client';

/**
 * Renders a NIP-17 kind-15 file message: fetch the ciphertext from Blossom,
 * check it against `x`, decrypt it in memory and show it from an object URL.
 *
 * Nothing decrypted touches disk — the object URL lives only as long as this
 * component and is revoked on unmount (docs/direct-messages.md: no DM
 * plaintext on disk). Images, video and audio decrypt as soon as they mount;
 * any other file type waits for a click, because it can only be downloaded
 * and there is no reason to pull a 25 MB zip the reader may never want.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { decryptFile, FileIntegrityError } from '@/lib/crypto/file-cipher';
import { dmFileCategory, type JsDmFile } from '@/lib/dm-file';
import { useTranslation } from '@/i18n/context';
import { DownloadIcon, FileIcon, LockIcon } from '@/components/ui/icons';
import { VoiceMessage } from '@/components/chat/MessageContent';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; integrity: boolean };

function formatBytes(n: number | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Fetch, verify and decrypt; resolves to a fresh object URL the caller owns. */
async function fetchDecrypted(file: JsDmFile, signal: AbortSignal): Promise<string> {
  const res = await fetch(file.url, { signal, referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cipher = new Uint8Array(await res.arrayBuffer());
  const plain = await decryptFile(cipher, file.key, file.nonce, file.x || undefined);
  if (signal.aborted) throw new DOMException('aborted', 'AbortError');
  return URL.createObjectURL(new Blob([plain as Uint8Array<ArrayBuffer>], { type: file.mimeType }));
}

export function useDecryptedDmFile(file: JsDmFile, auto: boolean) {
  const [state, setState] = useState<State>({ status: auto ? 'loading' : 'idle' });
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetchDecrypted(file, ctrl.signal).then(
      (url) => {
        if (ctrl.signal.aborted) { URL.revokeObjectURL(url); return; }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setState({ status: 'ready', url });
      },
      (err) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', integrity: err instanceof FileIntegrityError });
      },
    );
  }, [file]);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    start();
  }, [start]);

  useEffect(() => {
    if (auto) start();
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [auto, start]);

  return { state, load };
}

export function EncryptedDmAttachment({ file, onAccent = false }: { file: JsDmFile; onAccent?: boolean }) {
  const { t } = useTranslation();
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
          <button type="button" onClick={load} className="font-semibold underline">
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  }

  if (media) {
    if (state.status !== 'ready') {
      const aspect = file.dim ? `${file.dim.width} / ${file.dim.height}` : undefined;
      return (
        <div
          className="lc-skeleton flex min-h-24 w-64 max-w-full items-center justify-center rounded-lg"
          style={{ aspectRatio: category === 'image' ? aspect : undefined }}
          data-testid="dm-file-loading"
          role="status"
          aria-label={t('dm.file.decrypting')}
        >
          <LockIcon size={18} className={muted} />
        </div>
      );
    }
    if (category === 'image') {
      return (
        <a href={state.url} target="_blank" rel="noopener noreferrer" data-testid="dm-file-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.url} alt={file.name ?? t('dm.file.attachment')} className="max-h-80 max-w-full rounded-lg" />
        </a>
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
    <div className="flex items-center gap-3" data-testid="dm-file-card">
      <FileIcon size={22} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{label}</div>
        <div className={'flex items-center gap-1 text-[11px] ' + muted}>
          <LockIcon size={11} />
          <span>{[t('dm.file.attachment'), formatBytes(file.size)].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      {state.status === 'ready' ? (
        <a
          href={state.url}
          download={file.name ?? 'file'}
          className="flex items-center gap-1 rounded-full border border-current px-3 py-1 text-xs font-semibold"
          data-testid="dm-file-save"
        >
          <DownloadIcon size={14} />
          {t('dm.file.download')}
        </a>
      ) : (
        <button
          type="button"
          onClick={load}
          disabled={state.status === 'loading'}
          className="flex items-center gap-1 rounded-full border border-current px-3 py-1 text-xs font-semibold disabled:opacity-60"
          data-testid="dm-file-decrypt"
        >
          <DownloadIcon size={14} />
          {state.status === 'loading' ? t('dm.file.decrypting') : t('dm.file.open')}
        </button>
      )}
    </div>
  );
}
