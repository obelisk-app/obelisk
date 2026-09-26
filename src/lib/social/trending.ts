/**
 * What the feed is talking about right now.
 *
 * Derived from the notes already loaded, not from a separate query: the
 * window is what the reader is actually looking at, and asking four relays
 * for a global tag census would be a much bigger ask than the feature is
 * worth. That makes this "trending in your feed", which is the honest claim
 * — a Following feed of 40 people trends differently from the firehose, and
 * that's the useful part.
 *
 * Counted per note, not per tag occurrence: a post that tags `#nostr` six
 * times is one person talking about nostr.
 */

import type { Event as NostrEvent } from 'nostr-tools';

export type TrendingTag = {
  tag: string;
  /** Notes in the window carrying it. */
  count: number;
  /** Distinct authors — one person posting ten times is not a trend. */
  authors: number;
};

/** Tags this common are noise: everyone uses them, so they say nothing. */
const STOPWORDS = new Set(['nostr', 'plebchain', 'grownostr', 'asknostr']);

/**
 * One note is not a trend.
 *
 * With no floor the panel filled up with `#esim · 1` — tags that appeared
 * exactly once in the window. A "Trending" list whose entries all read `1`
 * is worse than an empty one: it looks broken rather than quiet.
 */
const MIN_COUNT = 3;

export function trendingTags(
  notes: readonly NostrEvent[],
  {
    limit = 10,
    includeCommon = false,
    minCount = MIN_COUNT,
  }: { limit?: number; includeCommon?: boolean; minCount?: number } = {},
): TrendingTag[] {
  const byTag = new Map<string, { count: number; authors: Set<string> }>();

  for (const note of notes) {
    const seen = new Set<string>();
    for (const tag of note.tags) {
      if (tag[0] !== 't' || !tag[1]) continue;
      const value = tag[1].toLowerCase();
      if (seen.has(value)) continue;
      seen.add(value);
      if (!includeCommon && STOPWORDS.has(value)) continue;
      const entry = byTag.get(value) ?? { count: 0, authors: new Set<string>() };
      entry.count += 1;
      entry.authors.add(note.pubkey);
      byTag.set(value, entry);
    }
  }

  return [...byTag.entries()]
    .map(([tag, entry]) => ({ tag, count: entry.count, authors: entry.authors.size }))
    .filter((entry) => entry.count >= minCount)
    // Distinct authors first: that's the difference between a conversation
    // and one person posting a lot. Count breaks the tie, then the name, so
    // the list doesn't reshuffle on every re-render.
    .sort((a, b) => b.authors - a.authors || b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}
