'use client';

import { useRef } from 'react';
import { CodeBlock } from './CodeBlock';
import { DownloadPngButton } from './DownloadPngButton';
import Heading from '@/components/ui/layout/Heading';

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
        <Heading as="h3" variant="card">{title}</Heading>
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
