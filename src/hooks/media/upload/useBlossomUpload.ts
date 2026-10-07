'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * One Blossom upload at a time, tagged with which slot it is for (a
 * profile picture or a banner, say), and the last error to show inline.
 *
 * The Blossom client is imported on first use so the forms that carry an
 * image field do not pay for it until someone actually picks a file.
 */
export function useBlossomUpload<Slot extends string>() {
  const t = useTranslations();
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File, slot: Slot, onUploaded: (url: string) => void) => {
    setUploading(slot);
    setError(null);
    try {
      const { uploadToBlossom } = await import('@/services/media/blossom');
      const url = await uploadToBlossom(file);
      onUploaded(url);
    } catch (err) {
      console.warn('[media] Blossom upload failed', err);
      setError(t('media.error.uploadFailed'));
    } finally {
      setUploading(null);
    }
  };

  return { uploading, error, upload };
}
