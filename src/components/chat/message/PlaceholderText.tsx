'use client';

import { placeholderSegments, type MentionMap } from '@/utils/message-text/placeholder-segments';
import { Fragment } from 'react';
import { CustomEmojiImg } from './CustomEmojiImg';
import { EveryoneChip } from './EveryoneChip';
import { MentionChip } from './MentionChip';

/** A text string with its mention, custom-emoji and @everyone placeholders swapped for their chips. */
export function PlaceholderText({ text, mentions, emojis }: { text: string; mentions: MentionMap; emojis: Record<string, string> }) {
  return <>{placeholderSegments(text, mentions, emojis).map((segment) => (
    <Fragment key={segment.key}>
      {segment.kind === 'everyone' ? <EveryoneChip />
        : segment.kind === 'mention' ? <MentionChip pubkey={segment.pubkey} displayName={segment.displayName} />
        : segment.kind === 'emoji' ? <CustomEmojiImg name={segment.name} url={segment.url} />
        : segment.text}
    </Fragment>
  ))}</>;
}
