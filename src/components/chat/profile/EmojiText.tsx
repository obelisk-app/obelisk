'use client';

import { emojiTextSegments } from '@/utils/chat/profile/emoji-text';
import { EmojiTextSegmentView } from './EmojiTextSegmentView';

/** A name or bio with `:shortcode:` custom emoji drawn as images. */
export function EmojiText({ text, emojis }: { text: string; emojis: Record<string, string> }) {
  return <>{emojiTextSegments(text, emojis).map((s) => <EmojiTextSegmentView key={s.key} segment={s} />)}</>;
}
