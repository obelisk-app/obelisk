/**
 * Shaping for the `nostr:` references a note body renders as chips, and the
 * hashtag links inside it.
 */

/** A `d` identifier as readable words: `1712000000-why-nostr` reads "why nostr". */
export function addressSlug(identifier: string): string {
  return identifier.replace(/^\d+-/, '').replace(/[-_]+/g, ' ').trim();
}

/** The note viewer's page for a reference, with the bech32 intact. */
export function noteViewerHref(raw: string): string {
  return `/notes/${raw.replace(/^nostr:/, '')}`;
}

/** A referenced note's opening words, on one line. */
export function noteSnippet(content: string | undefined): string | undefined {
  return content?.replace(/\s+/g, ' ').trim();
}

/** The tag of an in-app hashtag link (`/t/<tag>`), still URL-encoded; undefined for any other href. */
export function hashtagOfHref(href: string | null | undefined): string | undefined {
  return href?.match(/^\/t\/([^/?#]+)$/)?.[1];
}
