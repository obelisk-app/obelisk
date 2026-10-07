'use client';

import type { PlaceholderSegment } from '@/utils/message-text/placeholder-segments';
import { CustomEmojiImg } from './CustomEmojiImg';
import { EveryoneChip } from './EveryoneChip';
import { MentionChip } from './MentionChip';

/** One piece of message text: as it is, or the chip or emoji its placeholder stands for. */
export function PlaceholderSegmentView({ segment }: { segment: PlaceholderSegment }) {
  if (segment.kind === 'everyone') return <EveryoneChip />;
  if (segment.kind === 'mention') return <MentionChip pubkey={segment.pubkey} displayName={segment.displayName} />;
  if (segment.kind === 'emoji') return <CustomEmojiImg name={segment.name} url={segment.url} />;
  return <>{segment.text}</>;
}
