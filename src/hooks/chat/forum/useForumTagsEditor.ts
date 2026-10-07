'use client';

import type { JsForumTag } from '@/services/nostr-bridge';
import { MAX_FORUM_TAGS, removeTagAt, updateTagAt, withNewTag } from '@/utils/chat/forum/forum-tags';

/** The forum tag editor's edits on the tag list it is given: change, remove, and add up to `MAX_FORUM_TAGS`. */
export function useForumTagsEditor(value: ReadonlyArray<JsForumTag>, onChange: (next: ReadonlyArray<JsForumTag>) => void) {
  return {
    max: MAX_FORUM_TAGS,
    atMax: value.length >= MAX_FORUM_TAGS,
    updateAt: (idx: number, patch: Partial<JsForumTag>) => onChange(updateTagAt(value, idx, patch)),
    removeAt: (idx: number) => onChange(removeTagAt(value, idx)),
    addTag: () => {
      const next = withNewTag(value, MAX_FORUM_TAGS);
      if (next) onChange(next);
    },
  };
}
