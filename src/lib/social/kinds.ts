/**
 * Which event kinds the social feed reads, and how each must be rendered.
 *
 * A feed that renders only kind 1 is visibly shorter than Amethyst's for the
 * same follow set, and shows "unsupported" cards where other clients show
 * pictures and articles. The tiers below come from what the three major
 * clients actually publish into following feeds:
 *
 *  - Amethyst publishes the widest set (1, 6, 16, 20, 21, 22, 30023, 9802,
 *    1111, …).
 *  - Damus reads only 1, 6, 30023, 9802 — it has no case for 16, 20, 21, 22,
 *    1063 or 1111 and renders them as "unknown or unsupported kind".
 *  - Primal renders 1111 as an ordinary note, routes 30023 to a separate
 *    "Reads" surface, and only shows kind 20 when embedded/quoted.
 */

export const KIND_NOTE = 1;
export const KIND_REPOST = 6;
export const KIND_GENERIC_REPOST = 16;
export const KIND_REACTION = 7;
export const KIND_ZAP_RECEIPT = 9735;
export const KIND_PICTURE = 20;
export const KIND_VIDEO = 21;
export const KIND_SHORT_VIDEO = 22;
export const KIND_HIGHLIGHT = 9802;
export const KIND_LONG_FORM = 30023;
export const KIND_COMMENT = 1111;
/**
 * NIP-29 group chat message. Deliberately NOT in `FEED_KINDS`: a group's
 * messages belong to that group, not to the open feed. But a link to one
 * can be opened in the viewer, and "this client can't display kind 9" is a
 * silly thing for *this* client to say about its own chat messages.
 */
export const KIND_GROUP_CHAT = 9;
/** NIP-94 file metadata — the media lives in tags, not the content. */
export const KIND_FILE_METADATA = 1063;

/** Kinds we request in a feed REQ. Reactions/zaps are counted, not listed. */
export const FEED_KINDS = [
  KIND_NOTE,
  KIND_REPOST,
  KIND_GENERIC_REPOST,
  KIND_PICTURE,
  KIND_VIDEO,
  KIND_SHORT_VIDEO,
  KIND_HIGHLIGHT,
  KIND_LONG_FORM,
  KIND_COMMENT,
];

/**
 * Reader-facing content filter.
 *
 * "All" is the firehose; the others let someone read just the long-form or
 * just the pictures without being buried in short notes, which is the main
 * reason a mixed feed becomes unusable.
 */
export type ContentFilter = 'all' | 'notes' | 'articles' | 'media';

export const CONTENT_FILTERS: ContentFilter[] = ['all', 'notes', 'articles', 'media'];

/** Kinds to request for a given filter — narrowing the REQ, not just the view. */
export function kindsForFilter(filter: ContentFilter): number[] {
  switch (filter) {
    case 'notes':
      // Reposts belong here: a repost of a note is still a note in the feed.
      return [KIND_NOTE, KIND_REPOST, KIND_GENERIC_REPOST, KIND_COMMENT];
    case 'articles':
      return [KIND_LONG_FORM, KIND_HIGHLIGHT];
    case 'media':
      return [KIND_PICTURE, KIND_VIDEO, KIND_SHORT_VIDEO];
    case 'all':
    default:
      return FEED_KINDS;
  }
}

/** How a feed row should render a given kind. */
export type NoteRenderMode =
  | 'note'       // plain kind-1 style body
  | 'repost'     // wrapper — resolve and render the target, attributed
  | 'picture'    // media-first, content is a description; media in imeta
  | 'video'
  | 'highlight'  // content is SOMEONE ELSE'S words — must be attributed
  | 'article'    // addressable long-form: title/summary/image card
  | 'comment'    // NIP-22, threads via A/E/I + K/P, NOT NIP-10
  | 'group'      // NIP-29 chat message, shown with a way back to its group
  | 'file'       // NIP-94: url/mime live in tags
  | 'unsupported';

export function renderModeFor(kind: number): NoteRenderMode {
  switch (kind) {
    case KIND_NOTE: return 'note';
    case KIND_REPOST:
    case KIND_GENERIC_REPOST: return 'repost';
    case KIND_PICTURE: return 'picture';
    case KIND_VIDEO:
    case KIND_SHORT_VIDEO: return 'video';
    case KIND_HIGHLIGHT: return 'highlight';
    case KIND_LONG_FORM: return 'article';
    case KIND_COMMENT: return 'comment';
    case KIND_GROUP_CHAT: return 'group';
    case KIND_FILE_METADATA: return 'file';
    default: return 'unsupported';
  }
}
