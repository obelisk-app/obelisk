'use client';

import RemoteImage from '@/components/ui/media/RemoteImage';
import type { EmojiTextSegment } from '@/utils/chat/profile/emoji-text';

/** One piece of a name or bio: text, or a custom emoji sized to the line. */
export function EmojiTextSegmentView({ segment }: { segment: EmojiTextSegment }) {
  if (segment.kind === 'text') return <>{segment.text}</>;
  return (
    <RemoteImage
      src={segment.url}
      alt={`:${segment.name}:`}
      title={`:${segment.name}:`}
      className="inline-block w-[1.1em] h-[1.1em] align-[-0.15em] object-contain"
    />
  );
}
