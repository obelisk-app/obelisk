'use client';

import Link from '@/components/ui/navigation/Link';

import RemoteImage from '@/components/ui/media/RemoteImage';
import type { DmTextSegment } from '@/utils/chat/dm/dm-text-segments';

/** One segment of DM text: a link that opens in a new tab, a custom emoji, or plain text. */
export function DmTextSegmentView({ segment, linkClass }: { segment: DmTextSegment; linkClass: string }) {
  if (segment.kind === 'link') {
    return (
      <Link native href={segment.url} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
        {segment.url}
      </Link>
    );
  }
  if (segment.kind === 'emoji') {
    return <RemoteImage src={segment.url} alt={`:${segment.name}:`} title={`:${segment.name}:`} className="inline-block h-5 w-5 align-text-bottom object-contain" />;
  }
  return <>{segment.text}</>;
}
