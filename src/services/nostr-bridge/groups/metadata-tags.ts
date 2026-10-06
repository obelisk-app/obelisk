/**
 * The shape of a channel edit and the kind 9002 tags it becomes: name,
 * about, images, the visibility flags, the parent category, the channel
 * variant marker, and a publication's curated tags and topics. Pure move
 * from `groups/metadata.ts`.
 */
import type { JsForumTag } from '../types';

export interface EditGroupMetadataOptions {
  groupId: string;
  name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  isPublic?: boolean;
  isHidden?: boolean;
  isRestricted?: boolean;
  isOpen?: boolean;
  kind?: 'text' | 'voice' | 'voice-sfu' | 'forum';
  parent?: string;
  forumTags?: ReadonlyArray<JsForumTag>;
  topics?: ReadonlyArray<string>;
}

export type CreateGroupOptions = Omit<EditGroupMetadataOptions, 'groupId'> & { groupId?: string };

/** The kind 9002 tags for an edit. Kind 9002 is a full replacement, so `opts` is the whole intended state. */
export function editMetadataTags(opts: EditGroupMetadataOptions): string[][] {
  const tags: string[][] = [['h', opts.groupId]];
  if (opts.name !== undefined) tags.push(['name', opts.name]);
  if (opts.about !== undefined) tags.push(['about', opts.about]);
  if (opts.picture !== undefined) tags.push(['picture', opts.picture]);
  if (opts.banner !== undefined) tags.push(['banner', opts.banner]);
  if (opts.isPublic !== undefined) tags.push([opts.isPublic ? 'public' : 'private']);
  if (opts.isHidden) tags.push(['hidden']);
  if (opts.isRestricted) tags.push(['restricted']);
  if (opts.isOpen !== undefined) tags.push([opts.isOpen ? 'open' : 'closed']);
  if (opts.parent !== undefined && opts.parent) tags.push(['parent', opts.parent]);
  // The variant marker is "just another tag" on kind 9002; the relay
  // reflects it on kind 39000 like name/about. Omitting the tag
  // (kind: 'text') makes a previously-voice/forum channel revert to a
  // regular text channel.
  if (opts.kind === 'voice') tags.push(['t', 'voice']);
  else if (opts.kind === 'voice-sfu') tags.push(['t', 'voice-sfu']);
  else if (opts.kind === 'forum') tags.push(['t', 'forum']);
  // Curated forum tags (admin) + thread topic references. Kind 9002 is a
  // full replacement, so callers MUST pass the full intended set on every
  // edit. The new ForumView chrome and ChannelSettingsModal both load the
  // current set into local state and pass it back on save to preserve it.
  if (opts.forumTags) {
    for (const ft of opts.forumTags) {
      if (!ft.id || !ft.name) continue;
      // `["forum-tag", id, name, emoji?, color?]`. The color lives at slot
      // 4, so when it's present the emoji slot must be emitted even if
      // empty, otherwise the color would land at index 3 and be read back
      // as an emoji. Old clients read slots 1-3 and ignore the rest.
      if (ft.color) tags.push(['forum-tag', ft.id, ft.name, ft.emoji ?? '', ft.color]);
      else if (ft.emoji) tags.push(['forum-tag', ft.id, ft.name, ft.emoji]);
      else tags.push(['forum-tag', ft.id, ft.name]);
    }
  }
  if (opts.topics) {
    for (const id of opts.topics) {
      if (id) tags.push(['topic', id]);
    }
  }
  return tags;
}
