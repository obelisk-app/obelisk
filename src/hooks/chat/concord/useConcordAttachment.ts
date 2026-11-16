import { useEffect, useState } from 'react';
import type { MediaAttachment } from '@applesauce/concord/helpers';
import { readConcordAttachment, downloadConcordAttachment } from '@/services/chat/concord/media';

/** Authenticated media lives only in a disposable blob URL, never in a plaintext cache. */
export function useConcordAttachment(attachment: MediaAttachment) {
  const key = JSON.stringify(attachment);
  const [result, setResult] = useState<{ key: string; url?: string; error?: boolean } | null>(null);
  const type = attachment.type ?? '';
  const category = /^image\/(png|jpeg|gif|webp|avif)$/.test(type) ? 'image'
    : /^video\/(mp4|webm|ogg)$/.test(type) ? 'video'
      : /^audio\/(mpeg|mp4|ogg|wav|webm|x-wav)$/.test(type) ? 'audio' : 'file';
  useEffect(() => {
    if (category === 'file') return;
    let active = true;
    let url: string | undefined;
    const file = JSON.parse(key) as MediaAttachment;
    void readConcordAttachment(file).then(bytes => {
      if (!active) return;
      url = URL.createObjectURL(new Blob([bytes], { type: file.type }));
      setResult({ key, url });
    }).catch(() => { if (active) setResult({ key, error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [key, category]);
  return {
    category, url: result?.key === key ? result.url : undefined, error: result?.key === key && result.error,
    download: () => { void downloadConcordAttachment(attachment).catch(() => setResult({ key, error: true })); },
  };
}
