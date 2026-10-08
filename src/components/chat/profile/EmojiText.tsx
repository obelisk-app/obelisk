'use client';

import { emojiTextSegments } from '@/utils/chat/profile/emoji-text';
import { Fragment } from 'react';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** A name or bio with `:shortcode:` custom emoji drawn as images. */
export function EmojiText({ text, emojis }: { text: string; emojis: Record<string, string> }) {
  return <>{emojiTextSegments(text, emojis).map((segment) => (
    <Fragment key={segment.key}>
      {segment.kind === 'text' ? segment.text : (
        <RemoteImage
          src={segment.url}
          alt={`:${segment.name}:`}
          title={`:${segment.name}:`}
          className="inline-block w-[1.1em] h-[1.1em] align-[-0.15em] object-contain"
        />
      )}
    </Fragment>
  ))}</>;
}
