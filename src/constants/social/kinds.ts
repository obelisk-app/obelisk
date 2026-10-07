/**
 * Social: kinds. Values the code in `services/social/kinds.ts` reads, kept
 * here so every reader imports the one copy.
 */

import {
  KIND_COMMENT,
  KIND_GENERIC_REPOST,
  KIND_HIGHLIGHT,
  KIND_LONG_FORM,
  KIND_PICTURE,
  KIND_REPOST,
  KIND_SHORT_VIDEO,
  KIND_TEXT_NOTE,
  KIND_VIDEO,
} from '@/constants/nostr/nip-kinds';
import type { ContentFilter } from '@/services/social/kinds';

/**
 * Kinds we request in a feed REQ. Reactions/zaps are counted, not listed.
 * A NIP-29 group chat message (kind 9) is deliberately not one: a group's
 * messages belong to that group, not to the open feed. A link to one can
 * still be opened in the viewer (`renderModeFor` below).
 */
export const FEED_KINDS = [
  KIND_TEXT_NOTE,
  KIND_REPOST,
  KIND_GENERIC_REPOST,
  KIND_PICTURE,
  KIND_VIDEO,
  KIND_SHORT_VIDEO,
  KIND_HIGHLIGHT,
  KIND_LONG_FORM,
  KIND_COMMENT,
];

export const CONTENT_FILTERS: ContentFilter[] = ['all', 'notes', 'articles', 'media'];
