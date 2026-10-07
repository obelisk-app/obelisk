'use client';

import type { JsForumTag } from '@/services/nostr-bridge';
import { tagChipStyle } from '@/utils/chat/forum/forum-tag-colors';
import { TagDot } from './TagDot';

/** A tag the new publication can carry: pressed when picked, disabled once the maximum is picked. */
export function NewThreadTagChip({ tag, choice, onToggle }: {
  tag: JsForumTag;
  choice: { active: boolean; disabled: boolean };
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(tag.id)}
      disabled={choice.disabled}
      style={tagChipStyle(tag, choice.active)}
      className="rounded-full border px-3 py-1 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
      data-testid={`new-thread-tag-${tag.id}`}
      aria-pressed={choice.active}
    >
      {tag.emoji
        ? <span className="text-sm leading-none">{tag.emoji}</span>
        : <TagDot tag={tag} />}
      <span className="truncate max-w-[10rem]">{tag.name}</span>
    </button>
  );
}
