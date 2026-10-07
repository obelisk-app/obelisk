'use client';

import { useTranslations } from 'next-intl';
import { usePngDownload } from '@/hooks/media-kit/kit/usePngDownload';
import Button from '@/components/ui/buttons/Button';

/** Renders the node `targetRef` points at to a PNG and downloads it; says so while it works. */
export function DownloadPngButton({
  targetRef,
  filename,
  pixelWidth,
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  filename: string;
  pixelWidth?: number;
}) {
  const t = useTranslations();
  const { busy, download } = usePngDownload(targetRef, filename, pixelWidth);
  return (
    <Button variant="pill" size="xs" disabled={busy} onClick={download}>
      {busy ? t('mediaKit.rendering') : t('mediaKit.downloadPng')}
    </Button>
  );
}
