/**
 * NIP-84 highlights (kind 9802) — passages someone marked in something they
 * were reading.
 *
 * A highlight of a Nostr article is *not its own post*. It's a quote of
 * someone else's words with no commentary, and in a feed it reads as a
 * stranger posting a paragraph they didn't write. Worse, a popular article
 * produces dozens of them, all overlapping, pushing the article itself out
 * of the window.
 *
 * So: a highlight whose source is something we can render — an article, a
 * note — belongs *on* that thing, shown inline when the reader asks for it.
 * A highlight of an external page is different: nothing in the app can
 * display the source, the highlight IS the content, and it stays a feed row.
 *
 * `filterFeedHighlights` encodes exactly that split, and
 * `highlightsForArticle` is the reader-side query.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_HIGHLIGHT } from './kinds';
import { querySocial } from './pool';

export type HighlightSource =
  | { kind: 'event'; id: string }
  | { kind: 'address'; coordinate: string }
  | { kind: 'url'; url: string }
  | null;

/**
 * What was highlighted.
 *
 * `a` (addressable coordinate) is checked before `e`: highlights of
 * long-form carry both, and the coordinate is the one that survives an
 * edit of the article.
 */
export function highlightSource(event: Pick<NostrEvent, 'tags'>): HighlightSource {
  const coordinate = event.tags.find((tag) => tag[0] === 'a')?.[1];
  if (coordinate) return { kind: 'address', coordinate };
  const id = event.tags.find((tag) => tag[0] === 'e')?.[1];
  if (id) return { kind: 'event', id };
  const url = event.tags.find((tag) => tag[0] === 'r')?.[1];
  if (url) return { kind: 'url', url };
  return null;
}

/** The article coordinate `kind:pubkey:d`, for matching against a highlight. */
export function articleCoordinate(
  article: Pick<NostrEvent, 'kind' | 'pubkey' | 'tags'>,
): string {
  const identifier = article.tags.find((tag) => tag[0] === 'd')?.[1] ?? '';
  return `${article.kind}:${article.pubkey}:${identifier}`;
}

/**
 * Drop highlights that belong on something else, keep the ones that are
 * genuinely their own post.
 *
 * A highlight of an external URL survives: the app can't render that page,
 * so the quoted passage is the whole content, and the person who chose it
 * is publishing something. A highlight of a Nostr event does not: it shows
 * up inside the thing it highlights.
 *
 * `includeSourced` overrides that for a reader who asked to see them
 * anyway. Highlights are how people find good writing on Nostr — who
 * marked what is a signal — so hiding them is a sensible default and a
 * bad rule. The Articles filter carries the switch, because that is where
 * a wall of quoted paragraphs is something you might actually want.
 */
export function filterFeedHighlights(
  notes: readonly NostrEvent[],
  { includeSourced = false }: { includeSourced?: boolean } = {},
): NostrEvent[] {
  return notes.filter((note) => {
    if (note.kind !== KIND_HIGHLIGHT) return true;
    const source = highlightSource(note);
    // No source at all is unattributable — someone else's words with no way
    // to check them. Not something to show as a post, in either mode.
    if (!source) return false;
    return includeSourced || source.kind === 'url';
  });
}

/** Deduped by id, newest first — the same highlight arrives from every relay. */
function newestFirst(events: readonly NostrEvent[]): NostrEvent[] {
  const byId = new Map<string, NostrEvent>();
  for (const event of events) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at);
}

/**
 * Highlights other people made in this article.
 *
 * Queried on demand — nobody pays for this unless they turn it on, and a
 * feed of 50 articles would otherwise issue 50 of these.
 */
export async function fetchArticleHighlights(
  article: Pick<NostrEvent, 'id' | 'kind' | 'pubkey' | 'tags'>,
  opts: { relays?: readonly string[]; limit?: number } = {},
): Promise<NostrEvent[]> {
  const coordinate = articleCoordinate(article);
  const limit = opts.limit ?? 100;
  const events = await querySocial(
    [
      { kinds: [KIND_HIGHLIGHT], '#a': [coordinate], limit },
      // Some clients tag only the event id, even for addressable content.
      { kinds: [KIND_HIGHLIGHT], '#e': [article.id], limit },
    ],
    opts.relays ? { relays: opts.relays } : undefined,
  );

  return newestFirst(events.filter((event) => {
    if (event.kind !== KIND_HIGHLIGHT) return false;
    const source = highlightSource(event);
    return (source?.kind === 'address' && source.coordinate === coordinate)
      || (source?.kind === 'event' && source.id === article.id);
  }));
}

export type HighlightRun = {
  /** The highlighted passage, as it appears in the article body. */
  text: string;
  /** Everyone who highlighted it. */
  pubkeys: string[];
};

/**
 * Collapse highlights into the distinct passages to mark up.
 *
 * Identical passages are merged — on a popular article the same sentence is
 * highlighted by dozens of people, and marking it dozens of times over would
 * do nothing visible except cost work. Whitespace is normalised first
 * because clients differ on whether they include the trailing newline.
 */
export function highlightRuns(
  highlights: readonly NostrEvent[],
  { minLength = 8 }: { minLength?: number } = {},
): HighlightRun[] {
  const byText = new Map<string, HighlightRun>();
  for (const event of highlights) {
    const text = event.content.replace(/\s+/g, ' ').trim();
    // A two-character "highlight" would match everywhere in the article.
    if (text.length < minLength) continue;
    const existing = byText.get(text);
    if (existing) {
      if (!existing.pubkeys.includes(event.pubkey)) existing.pubkeys.push(event.pubkey);
    } else {
      byText.set(text, { text, pubkeys: [event.pubkey] });
    }
  }
  // Longest first: a passage containing another must be marked before the
  // shorter one, or the inner match splits the outer and the outer never
  // matches at all.
  return [...byText.values()].sort((a, b) => b.text.length - a.text.length);
}
