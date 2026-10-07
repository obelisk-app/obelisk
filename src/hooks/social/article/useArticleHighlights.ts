'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { fetchArticleHighlights, highlightRuns } from '@/services/social/highlights';
import { markHighlights } from '@/services/social/mark-highlights';

/**
 * Reader highlights for one article: off until asked for, fetched once per
 * article, and painted into the body element `bodyRef` points at.
 */
export function useArticleHighlights(note: NostrEvent) {
  const relays = usePreferences().socialRelays;

  // Off by default and fetched on demand: nobody pays for highlights unless
  // they ask, and a feed of 50 articles would otherwise issue 50 queries.
  const [showHighlights, setShowHighlights] = useState(false);
  // Keyed by note id rather than reset in an effect: an effect that clears
  // state on prop change renders once with the previous article's data.
  const [fetched, setFetched] = useState<{ noteId: string; events: NostrEvent[] } | null>(null);
  const highlights = fetched?.noteId === note.id ? fetched.events : null;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHighlights || highlights !== null) return;
    let cancelled = false;
    fetchArticleHighlights(note, { relays })
      .then((result) => { if (!cancelled) setFetched({ noteId: note.id, events: result }); })
      .catch(() => { if (!cancelled) setFetched({ noteId: note.id, events: [] }); });
    return () => { cancelled = true; };
  }, [showHighlights, highlights, note, relays]);

  const runs = useMemo(
    () => (showHighlights && highlights ? highlightRuns(highlights) : []),
    [showHighlights, highlights],
  );

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || runs.length === 0) return;
    // Marking returns its own undo, so toggling off restores the DOM rather
    // than re-rendering content that hasn't changed.
    return markHighlights(body, runs);
  }, [runs, note.id]);

  return { showHighlights, setShowHighlights, highlights, runs, bodyRef };
}
