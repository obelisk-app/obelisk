/**
 * Feed ranking.
 *
 * Until now `mergeNotes` was the entire algorithm: dedupe, sort by
 * `created_at`, cap. On a busy Following feed that surfaces whoever posts
 * most, which is not the same as whoever is worth reading.
 *
 * Two constraints shape this, and they're worth stating because they rule out
 * the obvious designs:
 *
 *  - **Paging is chronological.** `nextCursor` is a `created_at` `until`
 *    cursor, so ranking reorders *the window already loaded*; it cannot
 *    change what gets fetched. A "top posts this week" feed would need a
 *    different fetch strategy entirely.
 *  - **Signals arrive late.** Engagement counts and WoT verdicts resolve
 *    after the notes do, so scoring must be a pure function of whatever is
 *    known right now and be re-run when more arrives — never computed once
 *    and cached against the note.
 *
 * Everything here is pure and synchronous. The caller supplies the signals.
 */

import type { Event as NostrEvent } from 'nostr-tools';

export type FeedSort = 'recent' | 'top';

export type RankSignals = {
  /** Engagement counts; zeros when not yet resolved. */
  counts: (noteId: string) => {
    replyCount: number;
    repostCount: number;
    reactionCount: number;
    zapTotalSats: number;
  };
  /** Direct follows. */
  isFollowed: (pubkey: string) => boolean;
  /** Who reposted a given note, if anyone. */
  repostersOf: (noteId: string) => readonly string[];
  /**
   * WoT hop distance, or null when unresolved or the extension is absent —
   * which is the common case, so this must never be load-bearing.
   */
  wotDistance?: (pubkey: string) => number | null;
  /** Injectable for deterministic tests. */
  now?: number;
};

/** Newer wins, but not so hard that nothing else can move a note. */
export const RECENCY_HALF_LIFE_S = 6 * 60 * 60;

/**
 * Zaps outrank likes because a zap costs money and a like costs nothing;
 * replies outrank both because writing something is the highest-effort
 * signal a reader gives.
 */
const WEIGHTS = {
  reply: 3,
  repost: 2.5,
  reaction: 1,
  /**
   * Applied to the damped sat total, calibrated so a ~20 sat zap is worth
   * about one reply and 1000 sats about two. The damping is what keeps a
   * single large zap from buying the top of the feed.
   */
  zapSat: 0.6,
};

/**
 * Log damping. Raw counts are power-law distributed: one note with 4000
 * likes would otherwise outscore everything else on the page forever, and
 * the feed becomes a single viral post plus noise.
 */
function damp(value: number): number {
  return Math.log1p(Math.max(0, value));
}

export function engagementScore(counts: {
  replyCount: number;
  repostCount: number;
  reactionCount: number;
  zapTotalSats: number;
}): number {
  return (
    WEIGHTS.reply * damp(counts.replyCount)
    + WEIGHTS.repost * damp(counts.repostCount)
    + WEIGHTS.reaction * damp(counts.reactionCount)
    + WEIGHTS.zapSat * damp(counts.zapTotalSats)
  );
}

/** Exponential decay; 1.0 at post time, 0.5 one half-life later. */
export function recencyDecay(ageSeconds: number, halfLife = RECENCY_HALF_LIFE_S): number {
  if (ageSeconds <= 0) return 1;
  return Math.pow(2, -ageSeconds / halfLife);
}

/**
 * A follow's post beats a stranger's at equal engagement — you chose them.
 * Modest, so a genuinely notable stranger can still surface in Global.
 */
export function followBoost(followed: boolean): number {
  return followed ? 1.6 : 1;
}

/**
 * Your follows resharing something is a stronger endorsement than their
 * likes, because it puts their own name on it. Damped: the tenth reposter
 * adds much less than the second.
 */
export function repostBoost(followedReposters: number): number {
  return 1 + 0.5 * damp(followedReposters);
}

/**
 * WoT is a bonus, never a gate. Unresolved or no extension → 1.0, so a user
 * without the extension gets exactly the same ordering minus this term.
 */
export function wotBoost(distance: number | null | undefined): number {
  if (distance === null || distance === undefined) return 1;
  if (distance <= 0) return 1.5;
  if (distance === 1) return 1.3;
  if (distance === 2) return 1.15;
  return 1.05;
}

/**
 * Diversity. Without it one prolific poster owns the page: they post ten
 * times an hour, every post is recent, and recency is most of the score.
 * The nth post by the same author is worth 1/n of its score.
 */
export function authorPenalty(nthByAuthor: number): number {
  return 1 / (1 + nthByAuthor);
}

export type ScoredNote = { note: NostrEvent; score: number };

/**
 * Score and order a window of notes.
 *
 * Author diversity is applied in the *scoring pass*, in the order notes
 * arrive (newest first), so "nth by this author" means nth-most-recent —
 * which is the one that should keep full weight.
 */
export function rankNotes(
  notes: readonly NostrEvent[],
  signals: RankSignals,
): NostrEvent[] {
  const now = signals.now ?? Math.floor(Date.now() / 1000);
  const seenByAuthor = new Map<string, number>();

  const scored: ScoredNote[] = notes.map((note) => {
    const nth = seenByAuthor.get(note.pubkey) ?? 0;
    seenByAuthor.set(note.pubkey, nth + 1);

    const followedReposters = signals
      .repostersOf(note.id)
      .filter((pubkey) => signals.isFollowed(pubkey)).length;

    const score =
      (1 + engagementScore(signals.counts(note.id)))
      * recencyDecay(now - note.created_at)
      * followBoost(signals.isFollowed(note.pubkey))
      * repostBoost(followedReposters)
      * wotBoost(signals.wotDistance?.(note.pubkey))
      * authorPenalty(nth);

    return { note, score };
  });

  // Stable: equal scores keep their chronological order rather than
  // shuffling between renders as counts trickle in.
  return scored
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((item) => item.note);
}

/** `recent` passes through untouched — it must stay the raw timeline. */
export function applySort(
  notes: readonly NostrEvent[],
  sort: FeedSort,
  signals: RankSignals,
): NostrEvent[] {
  return sort === 'top' ? rankNotes(notes, signals) : [...notes];
}
