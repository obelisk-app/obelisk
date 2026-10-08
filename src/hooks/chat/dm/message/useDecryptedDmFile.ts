'use client';

/**
 * Drives one encrypted DM attachment from "idle" to a decrypted object URL.
 *
 * With `auto` the fetch starts on mount (images, video, audio); otherwise it
 * waits for `load()`, because a generic file can only be downloaded and there
 * is no reason to pull a 25 MB zip the reader may never want. The object URL
 * lives only as long as the hook and is revoked on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileIntegrityError } from '@nostr-wot/dm';
import type { JsDmFile } from '@/utils/attachments/dm-file';
import { fetchDecrypted } from '@/services/chat/dm/dm-file-decrypt';

export type DecryptedDmFileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; integrity: boolean };

export function useDecryptedDmFile(file: JsDmFile, auto: boolean) {
  const [state, setState] = useState<DecryptedDmFileState>({ status: auto ? 'loading' : 'idle' });
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
