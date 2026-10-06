import type { ReactNode } from 'react';

/** Longest URL we'll print in full before shortening it for display. */
const MAX_URL_LABEL = 48;

/**
 * A readable stand-in for a bare URL.
 *
 * Markdown autolinks arrive with the URL as their own link text, so a
 * `nostr:`-style `naddr1…` share link printed as five lines of unbroken
 * characters in the middle of a note. The href is untouched; only the label
 * shortens, and the full URL stays in `title`.
 *
 * Returns null when the link has real link text (`[label](href)`), which the
 * author chose and we must not rewrite.
 */
export function autolinkLabel(href: string, children: ReactNode): string | null {
  const text = typeof children === 'string'
    ? children
    : Array.isArray(children) && children.length === 1 && typeof children[0] === 'string'
      ? children[0]
      : null;
  if (text === null || text !== href) return null;
  if (text.length <= MAX_URL_LABEL) return null;

  let shown = text;
  try {
    const url = new URL(text);
    const tail = `${url.pathname}${url.search}${url.hash}`;
    shown = `${url.host}${tail === '/' ? '' : tail}`;
  } catch {
    // Not parseable: fall back to trimming the raw string.
  }
  return shown.length > MAX_URL_LABEL ? `${shown.slice(0, MAX_URL_LABEL - 1)}…` : shown;
}
