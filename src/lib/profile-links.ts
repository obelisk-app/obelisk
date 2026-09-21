/**
 * Links in profile metadata (kind 0).
 *
 * A bio is the one place people put their site, their other accounts and
 * their lightning address, and we were rendering it as flat text — so the
 * most useful thing on a profile was something you had to select and copy by
 * hand.
 *
 * Deliberately *not* `MessageContent`: that pipeline unfurls links into
 * preview cards and inlines images, which is right for a note and wrong for
 * a four-line bio that would then be taller than the profile. This produces
 * anchors and nothing else.
 */

/** A bio is text with links in it; this is one piece of that. */
export type BioSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

// Bare URLs, `nostr:` references, and NIP-05-ish addresses. The trailing
// `[^\s]` classes stop a sentence-ending period or a closing paren from
// being swallowed into the href.
const URL_PATTERN = /\b(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;
const NOSTR_PATTERN = /\b(?:nostr:)?((?:npub|nprofile|note|nevent|naddr)1[a-z0-9]{20,})\b/gi;

/**
 * Turn a `website` value into something an anchor can use.
 *
 * People type `example.com`, not `https://example.com`, and an href without
 * a scheme resolves against the app's own origin — so the one link on the
 * profile would navigate into Obelisk instead of out of it.
 */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  // Reject anything that isn't plausibly a host: a bio line like "ask me"
  // in the website field shouldn't become a link to https://ask me.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(value)) return `https://${value}`;
  return null;
}

/** Strip the scheme and any trailing slash — nobody reads `https://`. */
export function prettyUrl(href: string): string {
  return href.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/**
 * Split bio text into renderable segments.
 *
 * One pass over the combined matches rather than a replace chain, so a URL
 * containing something that looks like a nostr identifier can't be rewritten
 * from the inside out.
 */
export function bioSegments(text: string | null | undefined): BioSegment[] {
  const value = text ?? '';
  if (!value) return [];

  type Match = { start: number; end: number; segment: BioSegment };
  const matches: Match[] = [];

  for (const match of value.matchAll(URL_PATTERN)) {
    const href = match[1];
    matches.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      segment: { type: 'link', value: prettyUrl(href), href },
    });
  }

  for (const match of value.matchAll(NOSTR_PATTERN)) {
    const start = match.index ?? 0;
    // Skip identifiers that sit inside an already-matched URL.
    if (matches.some((other) => start >= other.start && start < other.end)) continue;
    const id = match[1];
    matches.push({
      start,
      end: start + match[0].length,
      // `/p` for people, `/notes` for events — the same viewer routes the
      // rest of the app links to.
      segment: {
        type: 'link',
        value: `${id.slice(0, 12)}…`,
        href: /^(npub|nprofile)/i.test(id) ? `/p/${id}` : `/notes/${id}`,
      },
    });
  }

  matches.sort((a, b) => a.start - b.start);

  const out: BioSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) out.push({ type: 'text', value: value.slice(cursor, match.start) });
    out.push(match.segment);
    cursor = match.end;
  }
  if (cursor < value.length) out.push({ type: 'text', value: value.slice(cursor) });
  return out;
}
