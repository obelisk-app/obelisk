'use client';

import { dmTextSegments } from '@/utils/chat/dm/dm-text-segments';
import { Fragment } from 'react';
import Link from '@/components/ui/navigation/Link';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** DM text with links and custom emoji; the text is cut up in `dmTextSegments`. */
export function TextWithEmoji({ text, emojis, linkClass }: { text: string; emojis: Record<string, string>; linkClass: string }) {
  return <>{dmTextSegments(text, emojis).map((segment) => (
    <Fragment key={segment.key}>
      {segment.kind === 'link' ? (
        <Link native href={segment.url} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>
          {segment.url}
        </Link>
      ) : segment.kind === 'emoji' ? (
        <RemoteImage src={segment.url} alt={`:${segment.name}:`} title={`:${segment.name}:`} className="inline-block h-5 w-5 align-text-bottom object-contain" />
      ) : segment.text}
    </Fragment>
  ))}</>;
}
