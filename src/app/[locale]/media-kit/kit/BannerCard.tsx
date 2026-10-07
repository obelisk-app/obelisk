'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { CodeBlock } from './kit-ui';
import { usePngDownload } from '@/hooks/media-kit/kit/usePngDownload';
import Button from '@/components/ui/buttons/Button';

function DownloadPngButton({
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

/** A banner preview with its name, export size and a PNG download. */
export function BannerCard({
  title,
  spec,
  children,
  filename,
  pixelWidth,
  extra,
}: {
  title: string;
  spec: string;
  filename: string;
  pixelWidth?: number;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="lc-card overflow-hidden">
      <div ref={ref}>{children}</div>
      <div className="border-t border-lc-border p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-lc-muted">
        <span>
          <span className="text-lc-white font-semibold">{title}</span> · {spec}
        </span>
        <div className="flex items-center gap-2">
          {extra}
          <DownloadPngButton
            targetRef={ref}
            filename={filename}
            pixelWidth={pixelWidth}
          />
        </div>
      </div>
    </div>
  );
}

/** An HTML embed rendered live, with a PNG download and the snippet to copy. */
export function EmbedPreview({
  title,
  html,
  filename,
  pixelWidth,
}: {
  title: string;
  html: string;
  filename: string;
  pixelWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <DownloadPngButton
          targetRef={ref}
          filename={filename}
          pixelWidth={pixelWidth}
        />
      </div>
      <div className="lc-card p-6 mb-3 flex justify-center">
        <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <CodeBlock code={html} />
    </div>
  );
}
