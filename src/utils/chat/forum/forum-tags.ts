import type { JsForumTag } from '@/services/nostr-bridge';
import { MAX_FORUM_TAGS } from '@/constants/chat/forum';

export function newForumTagId(): string {
  // 8-char URL-safe slug. Only needs uniqueness within one forum's tag set;
  // collision risk inside a typical < 20-tag list is negligible.
  return Math.random().toString(36).slice(2, 10);
}

/** The list with the tag at `idx` patched. */
export function updateTagAt(tags: ReadonlyArray<JsForumTag>, idx: number, patch: Partial<JsForumTag>): JsForumTag[] {
  return tags.map((t, i) => (i === idx ? { ...t, ...patch } : t));
}

/** The list without the tag at `idx`. */
export function removeTagAt(tags: ReadonlyArray<JsForumTag>, idx: number): JsForumTag[] {
  return tags.filter((_, i) => i !== idx);
}

/** The list with a blank tag appended, or null when it is already full. */
export function withNewTag(tags: ReadonlyArray<JsForumTag>, max = MAX_FORUM_TAGS): JsForumTag[] | null {
  if (tags.length >= max) return null;
  return [...tags, { id: newForumTagId(), name: '', emoji: null, color: null }];
}

/** An emoji field's value: capped at 4 code units, empty meaning none. */
export function tagEmojiValue(raw: string): string | null {
  // Keep it short: a single grapheme is the visual target, but browsers and
  // emoji selectors vary, so we cap at 4 code units rather than insisting
  // on grapheme-cluster math here.
  return raw ? raw.slice(0, 4) : null;
}

/** A tag chip in the new-publication form: picked, and locked because `max` others are already picked. */
export function threadTagChoice(selectedTagIds: ReadonlyArray<string>, id: string, max: number): { active: boolean; disabled: boolean } {
  const active = selectedTagIds.includes(id);
  return { active, disabled: !active && selectedTagIds.length >= max };
}

/** The picked tag ids after a tap on `id`: unpicked if it was picked, else picked unless `max` are already. */
export function toggleThreadTag(selectedTagIds: ReadonlyArray<string>, id: string, max: number): ReadonlyArray<string> {
  if (selectedTagIds.includes(id)) return selectedTagIds.filter((x) => x !== id);
  if (selectedTagIds.length >= max) return selectedTagIds;
  return [...selectedTagIds, id];
}
