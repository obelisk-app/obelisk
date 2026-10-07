'use client';

import { placeholderSegments, type MentionMap } from '@/utils/message-text/placeholder-segments';
import { PlaceholderSegmentView } from './PlaceholderSegmentView';

/** A text string with its mention, custom-emoji and @everyone placeholders swapped for their chips. */
export function PlaceholderText({ text, mentions, emojis }: { text: string; mentions: MentionMap; emojis: Record<string, string> }) {
  return <>{placeholderSegments(text, mentions, emojis).map((s) => <PlaceholderSegmentView key={s.key} segment={s} />)}</>;
}
