'use client';

import Card from '@/components/ui/layout/Card';
import Row from '@/components/ui/layout/Row';
import { useRef } from 'react';
import { DownloadPngButton } from './DownloadPngButton';

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
    <Card variant="interactive" padding="none" className="overflow-hidden">
      <div ref={ref}>{children}</div>
      <div className="border-t border-lc-border p-3 flex flex-wrap items-center justify-between gap-3 text-xs text-lc-muted">
        <span>
          <span className="text-lc-white font-semibold">{title}</span> · {spec}
        </span>
        <Row gap="2" align="center">
          {extra}
          <DownloadPngButton
            targetRef={ref}
            filename={filename}
            pixelWidth={pixelWidth}
          />
        </Row>
      </div>
    </Card>
  );
}
