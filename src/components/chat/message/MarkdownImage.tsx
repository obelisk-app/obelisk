'use client';

import { isSameOriginMediaUrl } from '@/utils/url/same-origin';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { RemoteMediaPlaceholder } from './RemoteMediaPlaceholder';

/**
 * A markdown image (`![alt](url)`). Bare URLs are hoisted into the gallery,
 * so this is the explicit form; it obeys the same remote-media gate.
 */
export function MarkdownImage({ src, alt, mediaShow, mediaReveal }: {
  src?: string | Blob;
  alt?: string;
  mediaShow: boolean;
  mediaReveal: () => void;
}) {
  if (!src) return null;
  const href = String(src);
  if (!mediaShow && !isSameOriginMediaUrl(href)) return <RemoteMediaPlaceholder onReveal={mediaReveal} compact />;
  return <RemoteImage src={href} alt={alt ?? ''} className="mt-1 max-w-sm max-h-80 rounded-lg object-contain bg-lc-black/50" />;
}
