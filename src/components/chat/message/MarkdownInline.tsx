'use client';

import type { ReactNode } from 'react';
import { hasPlaceholder, type MentionMap } from '@/utils/message-text/placeholder-segments';
import { PlaceholderText } from './PlaceholderText';
import { MarkdownInlineChild } from './MarkdownInlineChild';

/**
 * The children of a markdown text element (paragraph, heading, emphasis,
 * list item) with mention and custom-emoji placeholders swapped for their
 * chips. Other children pass through untouched.
 */
export function MarkdownInline({ children, mentions, emojis }: { children?: ReactNode; mentions: MentionMap; emojis: Record<string, string> }) {
  if (typeof children === 'string') {
    return hasPlaceholder(children) ? <PlaceholderText text={children} mentions={mentions} emojis={emojis} /> : <>{children}</>;
  }
  if (Array.isArray(children)) {
    return <>{children.map((child, i) => <MarkdownInlineChild key={i} child={child} mentions={mentions} emojis={emojis} />)}</>;
  }
  return <>{children}</>;
}
