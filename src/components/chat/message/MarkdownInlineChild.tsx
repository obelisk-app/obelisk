'use client';

import type { ReactNode } from 'react';
import { hasPlaceholder, type MentionMap } from '@/utils/message-text/placeholder-segments';
import { PlaceholderText } from './PlaceholderText';

/** One child of a markdown element: a string with placeholders gets their chips (in a span), anything else passes through. */
export function MarkdownInlineChild({ child, mentions, emojis }: { child: ReactNode; mentions: MentionMap; emojis: Record<string, string> }) {
  if (typeof child === 'string' && hasPlaceholder(child)) {
    return <span><PlaceholderText text={child} mentions={mentions} emojis={emojis} /></span>;
  }
  return <>{child}</>;
}
