'use client';

import { useState } from 'react';
import RemoteImage from '@/components/ui/RemoteImage';
import { previewHost, useLinkPreview } from './hooks/useLinkPreview';

/**
 * Unfurled card for a plain link in a message.
 *
 * Renders nothing at all until the preview resolves, and nothing ever if it
 * does not. A link that cannot be unfurled is already a working link in the
 * message body -- a broken or skeleton card in its place would be worse than
 * the absence of one.
 *
 * The text shown here comes from a third party, so it is rendered as text.
 * Nothing from the remote page is interpreted as markup.
 */
export default function LinkPreview({ url, showImage = true }: {
  url: string;
  /**
   * Whether to render the page's `og:image`. The unfurl itself goes through
   * our own `/api/link-preview`, so the reader's IP never reaches the linked
   * page; the image URL that comes back, however, points at whatever host
   * the page named, and loading it undoes that protection. Callers pass the
   * remote-media gate's verdict (`src/services/remote-media.ts`).
   */
  showImage?: boolean;
}) {
  const preview = useLinkPreview(url);
  const [imageBroken, setImageBroken] = useState(false);

  if (!preview) return null;

  const host = previewHost(preview);

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="obelisk-link-preview"
      data-kind={preview.kind}
    >
      {showImage && preview.image && !imageBroken && (
        <RemoteImage
          src={preview.image}
          alt=""
          className="obelisk-link-preview-image"
          onError={() => setImageBroken(true)}
        />
      )}
      <span className="obelisk-link-preview-body">
        <span className="obelisk-link-preview-site">{preview.siteName || host}</span>
        {preview.title && <span className="obelisk-link-preview-title">{preview.title}</span>}
        {preview.description && (
          <span className="obelisk-link-preview-description">{preview.description}</span>
        )}
      </span>
    </a>
  );
}
