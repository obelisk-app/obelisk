'use client';

import type { JsForumTag } from '@/services/nostr-bridge';
import { tagChipStyle } from '@/utils/forum-tag-colors';
import { TagDot } from './TagDot';

/** A filter chip for one curated tag; pressed while it filters the list. */
export function TagChip({
  tag,
  active,
  onClick,
}: {
  tag: JsForumTag;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Color is per-tag (admin-chosen or derived from the id), so it has to
      // be an inline style: Tailwind can't emit classes for runtime values.
      style={tagChipStyle(tag, active)}
      className="rounded-full border px-3 py-1 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
      data-testid={`forum-tag-${tag.id}`}
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
    >
      {tag.emoji
        ? <span className="text-sm leading-none">{tag.emoji}</span>
        : <TagDot tag={tag} />}
      <span className="truncate max-w-[10rem]">{tag.name}</span>
    </button>
  );
}
