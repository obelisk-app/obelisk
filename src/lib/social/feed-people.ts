/**
 * Who is worth following, derived from the feed already on screen.
 *
 * Same bargain as `trending.ts`: the window is what the reader is looking
 * at, so no extra relay query. In a Global feed that surfaces people posting
 * into your relays right now; in a Following feed it surfaces the people
 * your follows are boosting and replying to — which is the more interesting
 * of the two, and the reason reposts and reply targets count.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_REPOST, KIND_GENERIC_REPOST } from './kinds';

export type FeedAuthor = {
  pubkey: string;
  /** Notes, reposts-of and mentions in the window. */
  score: number;
  /** Notes they authored here — separates a poster from someone being talked about. */
  posts: number;
};

/** A repost's target author, from the `p` tag NIP-18 requires. */
function repostedAuthor(note: NostrEvent): string | null {
  if (note.kind !== KIND_REPOST && note.kind !== KIND_GENERIC_REPOST) return null;
  const tag = note.tags.find((entry) => entry[0] === 'p' && /^[0-9a-f]{64}$/i.test(entry[1] ?? ''));
  return tag?.[1]?.toLowerCase() ?? null;
}

export function suggestedAuthors(
  notes: readonly NostrEvent[],
  {
    limit = 5,
    exclude = [],
  }: {
    limit?: number;
    /** Who not to suggest — the reader and everyone they already follow. */
    exclude?: readonly string[];
  } = {},
): FeedAuthor[] {
  const skip = new Set(exclude.map((pubkey) => pubkey.toLowerCase()));
  const tally = new Map<string, { score: number; posts: number }>();

  const bump = (pubkey: string, score: number, post: boolean) => {
    const key = pubkey.toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key) || skip.has(key)) return;
    const entry = tally.get(key) ?? { score: 0, posts: 0 };
    entry.score += score;
    if (post) entry.posts += 1;
    tally.set(key, entry);
  };

  for (const note of notes) {
    const boosted = repostedAuthor(note);
    if (boosted) {
      // Someone your feed chose to amplify is a stronger signal than
      // someone who merely posted into it.
      bump(boosted, 3, false);
      continue;
    }
    bump(note.pubkey, 1, true);
  }

  return [...tally.entries()]
    .map(([pubkey, entry]) => ({ pubkey, ...entry }))
    // Someone who only ever appears once is noise, not a suggestion — unless
    // they were amplified, which `score` already reflects.
    .filter((author) => author.score > 1)
    .sort((a, b) => b.score - a.score || a.pubkey.localeCompare(b.pubkey))
    .slice(0, limit);
}
