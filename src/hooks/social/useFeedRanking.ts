'use client';

/**
 * The read side of `useFeed`: warm the signals a page needs (engagement
 * counts, author profiles), drop muted and blocked authors and sourced
 * highlights, group reposts, and order the window by `sort`, re-ranking for
 * a bounded while as late signals land.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useModerationStore } from '@/store/moderation';
import { useMyFollows } from '@/services/nostr-bridge';
import { wotEngine } from '@/services/wot';
import { applyModeration } from '@/services/social/feed';
import { filterFeedHighlights } from '@/services/social/highlights';
import { ensureCounts, getCounts } from '@/services/social/engagement';
import { ensureSocialProfiles } from '@/services/social/profiles';
import { applySort, type FeedSort } from '@/services/social/rank';
import { groupReposts } from '@/services/social/repost';

/** How often to re-score while late signals are still arriving. */
const SETTLE_INTERVAL_MS = 4000;
/** How many of those passes to run before the order is left alone. */
const SETTLE_TICKS = 5;

/** Fetch the counts and names the cards on screen will ask for. */
export function useFeedSignals(notes: readonly NostrEvent[], sort: FeedSort): void {
  // Engagement counts for whatever is on screen.
  useEffect(() => {
    if (notes.length === 0) return;
    void ensureCounts(notes.slice(0, 40).map((note) => note.id));
  }, [notes]);

  // Ranking needs counts for more than the visible top. Warming the whole
  // window would be wasteful, but ranking on mostly-zero counts is just
  // chronological with extra steps.
  useEffect(() => {
    if (sort !== 'top' || notes.length === 0) return;
    void ensureCounts(notes.slice(0, 100).map((note) => note.id));
  }, [notes, sort]);

  // Author names, in ONE query for the whole page. Resolving per card meant
  // ~50 round trips for data that fits in a single `authors` filter, and the
  // cards that lost the race just showed a truncated npub.
  useEffect(() => {
    if (notes.length === 0) return;
    void ensureSocialProfiles(notes.map((note) => note.pubkey));
  }, [notes]);
}

export function useRankedFeed(
  notes: NostrEvent[],
  sort: FeedSort,
  /** The feed key: restarts the settle window when the feed changes. */
  key: string,
  showHighlights: boolean,
): { ordered: NostrEvent[]; repostersByTarget: Map<string, string[]> } {
  const follows = useMyFollows();
  const isMuted = useModerationStore((state) => state.isMuted);
  const isBlocked = useModerationStore((state) => state.isBlocked);
  const visible = useMemo(
    () => applyModeration(
      // A highlight of a Nostr article is not its own post: it's someone
      // else's paragraph with no commentary, and it belongs on the article,
      // where the reader can turn it on. Highlights of external pages stay:
      // nothing here can render that page, so the passage IS the content.
      filterFeedHighlights(notes, { includeSourced: showHighlights }),
      (pubkey) => isMuted(pubkey) || isBlocked(pubkey),
    ),
    [notes, isMuted, isBlocked, showHighlights],
  );

  // Derived on read rather than stored: the cache holds notes only, and the
  // grouping depends on which notes happen to share the window.
  const repostersByTarget = useMemo(() => groupReposts(visible).repostersByTarget, [visible]);

  // Re-rank when late signals land. Counts and WoT verdicts resolve after the
  // notes do, so a score computed once would be a score computed on zeros.
  //
  // Bounded, though. This used to poll every four seconds for as long as the
  // feed was mounted, which meant a "Top" feed quietly resorted itself under
  // whoever was reading it, forever, long after every count had arrived.
  // Signals settle within seconds of a page landing; after that, movement is
  // just the list rearranging for no reason the reader can see.
  const [signalTick, setSignalTick] = useState(0);
  useEffect(() => {
    if (sort !== 'top') return;
    const bump = () => setSignalTick((n) => n + 1);
    const offWot = wotEngine.on('verdicts-changed', bump);
    // Counts arrive in batches; a slow poll is cheaper than subscribing to
    // every note id and re-rendering per arrival.
    let ticks = 0;
    const timer = setInterval(() => {
      bump();
      if (++ticks >= SETTLE_TICKS) clearInterval(timer);
    }, SETTLE_INTERVAL_MS);
    return () => { offWot(); clearInterval(timer); };
    // `key` restarts the window when the feed changes; `notes.length` when a
    // page lands, which is when fresh signals are actually pending.
  }, [sort, key, notes.length]);

  const followSet = useMemo(() => new Set(follows), [follows]);

  const ordered = useMemo(
    () => applySort(visible, sort, {
      counts: getCounts,
      isFollowed: (pubkey) => followSet.has(pubkey),
      repostersOf: (noteId) => repostersByTarget.get(noteId) ?? [],
      wotDistance: (pubkey) => wotEngine.getDistance(pubkey),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible, sort, followSet, repostersByTarget, signalTick],
  );

  return { ordered, repostersByTarget };
}
