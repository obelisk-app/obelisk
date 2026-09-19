/**
 * Engagement counts (replies / reposts / reactions / zaps) for feed notes.
 *
 * Today's profile feed shows a heart that publishes a kind 7 and then forgets
 * it: `reacted` is local component state, so it resets the moment you
 * navigate away, and no count is ever displayed. Next to Primal or Damus the
 * feed looks inert.
 *
 * `fetchEngagement` from the SDK batches kinds 6/7/9735 for a list of note
 * ids into three parallel subs. We put a `createKeyedObservable` in front so
 * the numbers are shared by every card showing that note and survive
 * remounts, and so a second card doesn't refire the query.
 */

import { createKeyedObservable, fetchEngagement, type Engagement } from '@nostr-wot/data';
import { KIND_TEXT_NOTE } from '../nip-kinds';
import { querySocial } from './pool';

export type NoteCounts = Engagement & { replyCount: number };

export const ZERO_COUNTS: NoteCounts = {
  reactionCount: 0,
  repostCount: 0,
  zapTotalSats: 0,
  replyCount: 0,
};

const counts = createKeyedObservable<string, NoteCounts>({
  equal: (a, b) => a.reactionCount === b.reactionCount
    && a.repostCount === b.repostCount
    && a.zapTotalSats === b.zapTotalSats
    && a.replyCount === b.replyCount,
});

const inFlight = new Set<string>();

export function getCounts(noteId: string): NoteCounts {
  return counts.get(noteId).value ?? ZERO_COUNTS;
}

export function subscribeCounts(noteId: string, cb: (value: NoteCounts) => void): () => void {
  return counts.subscribe(noteId, (slot) => cb(slot.value ?? ZERO_COUNTS));
}

/**
 * Optimistic bump after the local user acts, so the number moves before the
 * relay round-trip. The next real fetch overwrites it.
 */
export function bumpCounts(noteId: string, delta: Partial<NoteCounts>): void {
  const current = getCounts(noteId);
  counts.set(noteId, {
    reactionCount: current.reactionCount + (delta.reactionCount ?? 0),
    repostCount: current.repostCount + (delta.repostCount ?? 0),
    zapTotalSats: current.zapTotalSats + (delta.zapTotalSats ?? 0),
    replyCount: current.replyCount + (delta.replyCount ?? 0),
  });
}

/**
 * Reply counts aren't part of `fetchEngagement` (which covers 6/7/9735), so
 * we count kind-1 events that `#e`-reference the notes. One extra filter for
 * the whole batch.
 */
async function fetchReplyCounts(noteIds: string[]): Promise<Map<string, number>> {
  const tally = new Map<string, number>();
  if (noteIds.length === 0) return tally;
  const events = await querySocial([{ kinds: [KIND_TEXT_NOTE], '#e': noteIds }]);
  for (const event of events) {
    for (const tag of event.tags) {
      if (tag[0] !== 'e' || !tag[1]) continue;
      // A reply carries both root and reply e-tags; counting each referenced
      // id once per event keeps a nested reply from inflating its root.
      if (noteIds.includes(tag[1])) tally.set(tag[1], (tally.get(tag[1]) ?? 0) + 1);
    }
  }
  return tally;
}

/**
 * Fetch counts for any of `noteIds` not already loaded or in flight.
 * Safe to call on every render of a feed page.
 */
export async function ensureCounts(noteIds: readonly string[]): Promise<void> {
  const wanted = [...new Set(noteIds)].filter((id) => {
    if (inFlight.has(id)) return false;
    return counts.get(id).value === undefined;
  });
  if (wanted.length === 0) return;
  wanted.forEach((id) => inFlight.add(id));
  try {
    const [engagement, replies] = await Promise.all([
      fetchEngagement(wanted),
      fetchReplyCounts(wanted),
    ]);
    for (const id of wanted) {
      const base = engagement.get(id);
      counts.set(id, {
        reactionCount: base?.reactionCount ?? 0,
        repostCount: base?.repostCount ?? 0,
        zapTotalSats: base?.zapTotalSats ?? 0,
        replyCount: replies.get(id) ?? 0,
      });
    }
  } catch {
    // Counts are decoration — a relay that won't answer should leave the
    // feed readable, not blank it. Clear the in-flight marks so a later
    // page or a refresh can retry.
  } finally {
    wanted.forEach((id) => inFlight.delete(id));
  }
}

/** Test helper. */
export function _resetEngagement(): void {
  counts._reset();
  inFlight.clear();
}
