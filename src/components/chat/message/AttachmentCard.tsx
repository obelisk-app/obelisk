'use client';

import { useState } from 'react';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { DownloadIcon, FileIcon } from '@/assets/icons';
import Text from '@/components/ui/layout/Text';

interface AttachmentCardProps {
  url: string;
  name: string;
  /**
   * Optional preview thumbnail (e.g. the first page of a PDF). When provided
   * and reachable, it replaces the generic file icon. `onError` falls back
   * to the icon so broken thumbnails never leave a blank square.
   */
  thumbnailUrl?: string;
}

export default function AttachmentCard({ url, name, thumbnailUrl }: AttachmentCardProps) {
  const ext = (name.split('.').pop() || 'file').toUpperCase().slice(0, 5);
  const [thumbFailed, setThumbFailed] = useState(false);
  const showThumb = Boolean(thumbnailUrl && !thumbFailed);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className="mt-1 inline-flex items-center gap-3 max-w-sm border border-lc-border rounded-lg bg-lc-dark px-3 py-2 hover:bg-lc-border/40 transition-colors no-underline"
      data-testid="attachment-card"
    >
      <div className="shrink-0 w-10 h-10 rounded bg-lc-border/60 flex items-center justify-center overflow-hidden">
        {showThumb && thumbnailUrl ? (
          <RemoteImage
            src={thumbnailUrl}
            alt=""
            className="w-10 h-10 object-cover"
            onError={() => setThumbFailed(true)}
            data-testid="attachment-thumbnail"
          />
        ) : (
          <FileIcon size={18} strokeWidth={2} className="text-lc-green" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Text as="p" size="sm" tone="default" weight="medium" className="truncate">{name}</Text>
        <Text as="p" variant="caption">{ext}</Text>
      </div>
      <DownloadIcon strokeWidth={2} className="text-lc-muted shrink-0" />
    </a>
  );
}
