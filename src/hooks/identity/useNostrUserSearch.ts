'use client';

/**
 * Standards-only Nostr user search.
 *
 * Resolves a free-text query to user candidates using three orthogonal paths:
 *   - Direct identity decode: 64-char hex / `npub1…` / `nprofile1…` (NIP-19).
 *   - NIP-05 lookup: `name@host.tld` via `.well-known/nostr.json`.
 *   - NIP-50 free-text search against indexer relays for kind:0 metadata.
 *
 * No proprietary endpoints, no server route. Dedupe / ranking happens on the
 * client.
 */

import { useEffect, useMemo, useState } from 'react';
import { npubToHex } from '@nostr-wot/data';
import { useNostrQuery } from '@nostr-wot/data/react';
import { NIP05_RE, NIP50_RELAYS, QUERY_TIMEOUT_MS, SEARCH_DEBOUNCE_MS, type UserHit } from '@/constants/identity/user-search';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';
import { resolveNip05 } from '@/services/identity/user-search';
import { userSearchHits } from '@/utils/identity/user-search';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export interface NostrUserSearchResult {
  /** Direct hit when the query decodes as hex / npub / nprofile (NIP-19). */
  directHit: UserHit | null;
  /** Resolved NIP-05 hit when the query matches `name@host.tld`. */
  nip05Hit: UserHit | null;
  /** NIP-50 kind:0 `search` results from indexer relays. */
  nostrResults: UserHit[];
  loading: boolean;
}

export function useNostrUserSearch(rawQuery: string): NostrUserSearchResult {
  const trimmed = rawQuery.trim();
  const debounced = useDebounced(trimmed, SEARCH_DEBOUNCE_MS);

  const directHex = useMemo(() => (debounced ? npubToHex(debounced) : null), [debounced]);
  const directHit: UserHit | null = directHex
    ? { pubkey: directHex, displayName: null, picture: null, nip05: null }
    : null;

  const enabled = debounced.length >= 2 && !directHex;

  // The NIP-05 answer is stored with the query it answers, so a new query
  // never shows the previous one's hit, not even for the render before the
  // lookup starts (the old reset ran in the effect, after that render).
  const [nip05, setNip05] = useState<{ query: string; hit: UserHit | null } | null>(null);
  const wantsNip05 = enabled && NIP05_RE.test(debounced);
  const nip05Hit = wantsNip05 && nip05?.query === debounced ? nip05.hit : null;
  const nip05Loading = wantsNip05 && nip05?.query !== debounced;

  useEffect(() => {
    if (!wantsNip05) return;
    const ac = new AbortController();
    resolveNip05(debounced, ac.signal).then((hit) => {
      if (!ac.signal.aborted) setNip05({ query: debounced, hit });
    });
    return () => ac.abort();
  }, [debounced, wantsNip05]);

  const filters = useMemo(
    () => (enabled ? [{ kinds: [KIND_METADATA], search: debounced, limit: 10 }] : []),
    [debounced, enabled],
  );
  const { events, loading: queryLoading } = useNostrQuery(filters, {
    enabled,
    relays: NIP50_RELAYS,
    timeoutMs: QUERY_TIMEOUT_MS,
  });

  const nostrResults = useMemo(
    () => enabled ? userSearchHits(events, nip05Hit?.pubkey) : [],
    [events, enabled, nip05Hit?.pubkey],
  );

  // While the debounce window is open, `debounced` still holds the PREVIOUS
  // query, so `nostrResults` describes text the user has already moved on
  // from. Reporting `loading` here keeps the caller from rendering those
  // stale hits (and a "no matches" flash) as a settled answer for the new
  // query.
  const debouncing = trimmed !== debounced;

  return {
    directHit: debouncing ? null : directHit,
    nip05Hit: debouncing ? null : nip05Hit,
    nostrResults: debouncing ? [] : nostrResults,
    loading: debouncing || (enabled && (queryLoading || nip05Loading)),
  };
}
