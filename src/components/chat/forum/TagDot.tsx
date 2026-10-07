'use client';

import type { JsForumTag } from '@/services/nostr-bridge';
import { paletteForTag } from '@/utils/chat/forum/forum-tag-colors';

/** Leading color dot, used when a tag has no emoji of its own. */
export function TagDot({ tag }: { tag: JsForumTag }) {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 rounded-full shrink-0"
      style={{ background: paletteForTag(tag).text }}
    />
  );
}
