import type { JsForumTag } from '@/services/nostr-bridge';
import { paletteForTag } from '@/utils/chat/forum/forum-tag-colors';

/** Leading color dot for a publication tag with no emoji of its own. */
export function MobileTagDot({ tag }: { tag: JsForumTag }) {
  return (
    <span
      aria-hidden
      style={{
        width: 6,
        height: 6,
        borderRadius: 999,
        flexShrink: 0,
        background: paletteForTag(tag).text,
      }}
    />
  );
}
