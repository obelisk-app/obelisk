import type { JsForumTag } from '@/services/nostr-bridge';
import { tagChipStyle } from '@/utils/chat/forum/forum-tag-colors';
import { TagDot } from './TagDot';

/** A thread's tag as a small coloured chip on its card. */
export function InlineTagChip({ tag }: { tag: JsForumTag }) {
  return (
    <span
      style={tagChipStyle(tag)}
      className="rounded-full border px-2 py-0.5 text-[10px] flex items-center gap-1 max-w-[10rem]"
      data-testid={`thread-tag-${tag.id}`}
    >
      {tag.emoji
        ? <span className="leading-none">{tag.emoji}</span>
        : <TagDot tag={tag} />}
      <span className="truncate">{tag.name}</span>
    </span>
  );
}
