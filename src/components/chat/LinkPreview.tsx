'use client';

import { useEffect, useState } from 'react';
import type { LinkPreview as Preview } from '@/lib/link-preview';

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
export default function LinkPreview({ url }: { url: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Preview | null) => {
        if (!cancelled && data && !('error' in data)) setPreview(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url]);

  if (!preview) return null;

  const host = (() => {
    try {
      return new URL(preview.url).hostname.replace(/^www\./, '');
    } catch {
      return preview.siteName ?? '';
    }
  })();

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="obelisk-link-preview"
      data-kind={preview.kind}
    >
      {preview.image && !imageBroken && (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote
        // host; next/image would need every domain allowlisted up front.
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
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
