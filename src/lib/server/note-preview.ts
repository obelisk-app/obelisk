import 'server-only';

/**
 * Turning an event into the title/description/image a link preview needs.
 *
 * Kept separate from the fetch so it stays pure and testable: preview text is
 * fiddly (markdown, `nostr:` URIs, images-as-content) and getting it wrong is
 * visible to everyone the link is shared with.
 */

import type { Event as NostrEvent } from 'nostr-tools';

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 200;

/** Media URLs that appear as bare links in content. */
const IMAGE_URL_RE = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?/i;
const URL_RE = /https?:\/\/\S+/g;
/** `nostr:` mentions are 60+ chars of bech32 and read as noise in a preview. */
const NOSTR_URI_RE = /nostr:[a-z0-9]+/gi;

function tagValue(note: Pick<NostrEvent, 'tags'>, name: string): string | null {
  return note.tags.find((tag) => tag[0] === name)?.[1]?.trim() || null;
}

function truncate(value: string, max: number): string {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  // Break on a word so the ellipsis doesn't land mid-word.
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Strip the things that read badly in a one-line preview: markdown syntax,
 * bech32 mentions, and bare URLs.
 */
export function plainTextForPreview(content: string): string {
  return content
    .replace(NOSTR_URI_RE, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')          // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // links → their text
    .replace(/```[\s\S]*?```/g, ' ')                // fenced code
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')                    // headings
    .replace(/(\*\*|__|\*|_|~~)/g, '')              // emphasis
    .replace(/^>\s?/gm, '')                         // quotes
    .replace(URL_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First image we can use as the preview card's picture. */
export function previewImage(note: Pick<NostrEvent, 'content' | 'tags'>): string | null {
  const fromTag = tagValue(note, 'image');
  if (fromTag) return fromTag;

  // NIP-92 imeta carries the canonical URL for attached media.
  for (const tag of note.tags) {
    if (tag[0] !== 'imeta') continue;
    for (const part of tag.slice(1)) {
      if (typeof part === 'string' && part.startsWith('url ')) return part.slice(4).trim();
    }
  }

  return note.content.match(IMAGE_URL_RE)?.[0] ?? null;
}

export type NotePreview = {
  title: string;
  description: string;
  image: string | null;
  isArticle: boolean;
};

export function buildNotePreview(
  note: Pick<NostrEvent, 'content' | 'tags' | 'kind'>,
  authorName: string,
): NotePreview {
  const isArticle = note.kind >= 30000 && note.kind < 40000;
  const articleTitle = tagValue(note, 'title');
  const summary = tagValue(note, 'summary');
  const body = plainTextForPreview(note.content);

  if (isArticle) {
    return {
      title: truncate(articleTitle || body || 'Untitled article', MAX_TITLE),
      description: truncate(summary || body, MAX_DESCRIPTION),
      image: previewImage(note),
      isArticle: true,
    };
  }

  // A note has no title, so the author is the title and the note is the body
  // — the shape every social preview card uses.
  return {
    title: `${authorName} on Obelisk`,
    // An image-only post strips to nothing; say so rather than showing blank.
    description: truncate(body || 'Shared media', MAX_DESCRIPTION),
    image: previewImage(note),
    isArticle: false,
  };
}
