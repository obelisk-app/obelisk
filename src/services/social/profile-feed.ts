import type { Event as NostrEvent } from 'nostr-tools';
import { isVideoUrl } from '@/utils/attachments/attachments';
import { extractUrls, isImageUrl } from '@/utils/message-text/markdown';

export type ProfileFeedTab = 'posts' | 'replies' | 'media' | 'articles';

/**
 * Relay configuration moved to `src/utils/social/relays.ts`, which allows 1–8
 * relays instead of exactly three and validates via the SDK's
 * `isPublicWssUrl`. Reply detection moved to `src/services/social/feed.ts`
 * (`isReplyNote`), which honours NIP-10 markers; the old version here
 * counted *any* `e` tag, so quotes and event mentions were misfiled as
 * replies.
 */
import { isReplyNote } from './feed';
import { KIND_LONG_FORM } from '@/constants/nostr/nip-kinds';

export { isReplyNote as isReply };

export function mediaUrls(note: Pick<NostrEvent, 'content'>): string[] {
  return extractUrls(note.content).filter((url) => isImageUrl(url) || isVideoUrl(url));
}

const HASHTAG_PATTERN = /(^|[\s(])#([\p{L}\p{N}_]+)/gu;

export function linkifyHashtags(content: string): string {
  return content.replace(HASHTAG_PATTERN, (_match, prefix: string, hashtag: string) => (
    `${prefix}[#${hashtag}](/t/${encodeURIComponent(hashtag.toLowerCase())})`
  ));
}

export function hashtagTags(content: string): string[][] {
  const hashtags = new Set<string>();
  for (const match of content.matchAll(HASHTAG_PATTERN)) hashtags.add(match[2].toLowerCase());
  return [...hashtags].map((hashtag) => ['t', hashtag]);
}

export function isArticle(note: Pick<NostrEvent, 'kind'>): boolean {
  return note.kind === KIND_LONG_FORM;
}

export function filterProfileFeed(notes: readonly NostrEvent[], tab: ProfileFeedTab): NostrEvent[] {
  return notes.filter((note) => {
    switch (tab) {
      case 'replies': return isReplyNote(note);
      case 'media': return mediaUrls(note).length > 0;
      case 'articles': return isArticle(note);
      // Posts excludes long-form: an essay in a list of one-liners buries
      // them, and it has a tab of its own.
      default: return !isReplyNote(note) && !isArticle(note);
    }
  });
}

export function toggledFollowTags(
  tags: readonly (readonly string[])[],
  pubkey: string,
  following: boolean,
): string[][] {
  const withoutTarget = tags
    .filter((tag) => !(tag[0] === 'p' && tag[1] === pubkey))
    .map((tag) => [...tag]);
  return following ? [...withoutTarget, ['p', pubkey]] : withoutTarget;
}
