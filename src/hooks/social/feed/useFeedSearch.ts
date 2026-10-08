'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useNostrUserSearch } from '@/hooks/identity/useNostrUserSearch';
import { topHashtags } from '@nostr-wot/data';
import { parseQuery, searchHashtag, searchNotes, type ParsedQuery } from '@/services/social/search';
import { ensureSocialProfiles } from '@/services/social/profiles';
import { mergeUserHits } from '@/utils/identity/user-hits';

const DEBOUNCE_MS = 300;
/** How many people the feed search lists above the notes. */
const FEED_SEARCH_MAX_PEOPLE = 8;
/** One shared empty list, so an idle search keeps a stable identity. */
const EMPTY_NOTES: NostrEvent[] = [];

/**
 * The open-network search behind the feed's search screen: the typed text,
 * debounced, parsed into a hashtag, text or identifier query, and answered
 * with notes, people and related hashtags.
 *
 * `openProfile` is the host's profile handler with a stable identity, so
 * the memoised note cards in the results don't re-render on every keystroke.
 */
export function useFeedSearch(initialQuery: string, onOpenProfile?: (pubkey: string) => void) {
  const [raw, setRaw] = useState(initialQuery);
  // Seeded, not debounced-from-empty: arriving with a query already chosen
  // shouldn't cost a 300ms wait before anything happens.
  const [debounced, setDebounced] = useState(initialQuery);
  // The last fetched result list stays on screen while the next query runs,
  // so typing does not flicker through an empty state.
  const [fetchedNotes, setFetchedNotes] = useState<NostrEvent[]>([]);
  // The query the fetched notes answer; `loading` is "not this one yet".
  const [settledFor, setSettledFor] = useState<ParsedQuery | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(raw.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [raw]);

  const parsed = useMemo(() => parseQuery(debounced), [debounced]);
  // Nothing to fetch for an empty box or a bare identifier (people search
  // covers the latter).
  const noteSearchIdle = parsed.kind === 'empty' || parsed.kind === 'identifier';
  const notes = noteSearchIdle ? EMPTY_NOTES : fetchedNotes;
  const loading = !noteSearchIdle && settledFor !== parsed;

  // People search is already solved (NIP-19 decode, NIP-05 and NIP-50
  // kind-0 lookup) so reuse it rather than writing a second one.
  const people = useNostrUserSearch(
    parsed.kind === 'text' || parsed.kind === 'identifier' ? debounced : '',
  );

  useEffect(() => {
    if (parsed.kind === 'empty' || parsed.kind === 'identifier') return;
    let cancelled = false;
    const run = parsed.kind === 'hashtag'
      ? searchHashtag(parsed.tag)
      : searchNotes(parsed.text);

    run
      .then((results) => {
        if (cancelled) return;
        setFetchedNotes(results);
        // Names for the result authors, in one query.
        void ensureSocialProfiles(results.map((note) => note.pubkey));
      })
      .catch(() => { if (!cancelled) setFetchedNotes([]); })
      .finally(() => { if (!cancelled) setSettledFor(parsed); });

    return () => { cancelled = true; };
  }, [parsed]);

  const userHits = useMemo(
    () => mergeUserHits(people.directHit, people.nip05Hit, people.nostrResults, FEED_SEARCH_MAX_PEOPLE),
    [people.directHit, people.nip05Hit, people.nostrResults],
  );

  const tags = useMemo(() => topHashtags(notes), [notes]);
  const busy = loading || people.loading;
  const empty = debounced.length > 0 && !busy && notes.length === 0 && userHits.length === 0;

  const openProfile = useCallback((pubkey: string) => onOpenProfile?.(pubkey), [onOpenProfile]);

  return { raw, setRaw, debounced, notes, userHits, tags, busy, empty, openProfile };
}
