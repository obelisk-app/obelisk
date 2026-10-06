'use client';

/**
 * NIP-50 search over the active relay, minus its paint. The desktop
 * `SearchBar` and the phone `SearchScreen` are skins over this; the grammar
 * is `src/utils/search-query.ts`.
 *
 *   from:<npub|hex|name>     → author filter
 *   in:<group id|name>       → restrict to a NIP-29 group (`#h`)
 *   mentions:<npub|hex|name> → `#p` filter
 *   has:link|image|file      → client-side content filter
 *   before:/after:<date>     → `until` / `since`
 *   "quoted phrase"          → matched literally
 *
 * Behaviours worth knowing:
 *
 * - **Live, debounced.** Typing used to do nothing until Enter on desktop
 *   while the Users and Channels sections updated live, which made the whole
 *   bar read as broken. Every change invalidates what is on screen: results
 *   and errors clear immediately, not only on success, so the previous
 *   query's hits are never shown against the new text.
 * - **Multi-word queries are ANDed client-side.** Relays match the NIP-50
 *   `search` value as a literal substring of the whole string, so "hola
 *   mundo" verbatim returns nothing. The bridge sends only the most selective
 *   term and filters the rest locally.
 * - **`from:`/`in:` accept names, not just ids.** They resolve against the
 *   relay's known people and the user's channels. A value that resolves to
 *   nothing is reported (`parsed.unresolved`) rather than silently dropped.
 * - **One guard for every in-flight request.** A response whose sequence is
 *   no longer current is dropped, so a slow early query cannot overwrite a
 *   fast later one, and nothing is set after unmount.
 * - **NIP-11 is consulted.** A relay without NIP-50 ignores the `search`
 *   field and hands back unfiltered recent events, which must not be shown
 *   as hits; `relaySearchable` tells the skin to say so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  nostrActions,
  useCurrentRelayUrl,
  useGroups,
  useRelayPeople,
  type JsSearchHit,
} from '@/services/nostr-bridge';
import { searchGroups } from '@/services/group-search';
import { isEmptyQuery, nameMatches, parseSearchQuery, type ParsedQuery } from '@/utils/search-query';
import { fetchRelayInfo, supportsSearch } from '@/services/relay-info';
import { useChatStore } from '@/store/chat';
import { decodeNpub, loadHistory, pushHistory, wipeHistory } from './relay-search/search-history';
import type { RelaySearch, RelaySearchOptions } from './relay-search/types';

export type { RelaySearch, RelaySearchOptions } from './relay-search/types';

export const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 30;

export function useRelaySearch({ activeGroupId = null }: RelaySearchOptions = {}): RelaySearch {
  const [raw, setRaw] = useState('');
  const [thisChannelOnly, setThisChannelOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ReadonlyArray<JsSearchHit>>([]);
  const [partial, setPartial] = useState(false);
  const [relayFiltered, setRelayFiltered] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadingMore, setLoadingMore] = useState(false);

  const groups = useGroups();
  const people = useRelayPeople();
  const relayUrl = useCurrentRelayUrl();

  const [relaySearchable, setRelaySearchable] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void fetchRelayInfo(relayUrl).then((info) => {
      if (!cancelled) setRelaySearchable(supportsSearch(info));
    });
    return () => { cancelled = true; };
  }, [relayUrl]);

  const resolvePubkey = useCallback((value: string): string | null => {
    const hex = decodeNpub(value);
    if (hex) return hex;
    const hit = people.find((p) => nameMatches(p.displayName, value))
      ?? people.find((p) => nameMatches(p.nip05, value));
    return hit?.pubkey ?? null;
  }, [people]);

  const resolveGroup = useCallback((value: string): string | null => {
    if (groups.some((g) => g.id === value)) return value;
    return searchGroups(groups, value)[0]?.id ?? null;
  }, [groups]);

  const parsed = useMemo(
    () => parseSearchQuery(raw, { resolvePubkey, resolveGroup }),
    [raw, resolvePubkey, resolveGroup],
  );

  const hasStructuredTokens = /(^|\s)(from|in|mentions|has|before|after):/i.test(raw);
  const entityQuery = useMemo(() => parsed.terms.map((x) => x.text).join(' '), [parsed.terms]);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g] as const)), [groups]);
  const channelMatches = useMemo(
    () => (entityQuery ? searchGroups(groups, entityQuery) : groups),
    [groups, entityQuery],
  );

  const reqRef = useRef(0);
  useEffect(() => () => { reqRef.current = -1; }, []);

  const runSearch = useCallback(async (q: ParsedQuery, opts: { until?: number } = {}) => {
    const append = opts.until !== undefined;
    const seq = ++reqRef.current;
    if (append) setLoadingMore(true); else setBusy(true);
    setError(null);
    try {
      const res = await nostrActions.searchMessages({
        terms: q.terms,
        authors: q.authors.length > 0 ? q.authors : undefined,
        mentions: q.mentions.length > 0 ? q.mentions : undefined,
        groupIds: q.groupIds.length > 0
          ? q.groupIds
          : thisChannelOnly && activeGroupId ? [activeGroupId] : undefined,
        has: q.has.length > 0 ? q.has : undefined,
        since: q.since,
        until: opts.until ?? q.until,
        limit: PAGE_SIZE,
        relaySupportsSearch: relaySearchable,
      });
      if (reqRef.current !== seq) return;
      setResults((prev) => {
        if (!append) return res.hits;
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...res.hits.filter((m) => !seen.has(m.id))];
      });
      setPartial(res.partial);
      setRelayFiltered(res.relayFiltered);
    } catch (e) {
      if (reqRef.current !== seq) return;
      setError((e as Error).message);
    } finally {
      if (reqRef.current === seq) {
        if (append) setLoadingMore(false); else setBusy(false);
      }
    }
  }, [activeGroupId, thisChannelOnly, relaySearchable]);

  // `parsed` is rebuilt every render; this is its stable identity. The
  // other two inputs are what `runSearch` closes over, so a change in any of
  // them is a new search exactly as before.
  const queryKey = JSON.stringify([
    parsed.terms, parsed.authors, parsed.mentions, parsed.groupIds,
    parsed.has, parsed.since, parsed.until, thisChannelOnly,
    activeGroupId, relaySearchable,
  ]);
  // Every change invalidates what is on screen in the render that first
  // sees it (the previous-value pattern): results and errors clear
  // immediately, not one commit later and not only on success.
  const [shownQueryKey, setShownQueryKey] = useState(queryKey);
  if (shownQueryKey !== queryKey) {
    setShownQueryKey(queryKey);
    setResults([]);
    setError(null);
    setPartial(false);
    setActiveIndex(-1);
    setBusy(!isEmptyQuery(parsed));
  }
  useEffect(() => {
    reqRef.current++;
    if (isEmptyQuery(parsed)) return;
    const handle = setTimeout(() => { void runSearch(parsed); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, runSearch]);

  const commit = useCallback((text: string) => { setHistory(pushHistory(text)); }, []);

  const jumpTo = useCallback((hit: JsSearchHit) => {
    // Through the shell, never `setActiveGroup`: that only moves the relay
    // subscription, and what is on screen is the shell's own view state.
    if (hit.groupId) useChatStore.getState().requestJump(hit.groupId, hit.id);
    commit(raw);
  }, [raw, commit]);

  const submit = useCallback(() => {
    commit(raw);
    void runSearch(parsed);
  }, [commit, raw, runSearch, parsed]);

  const applyFilter = useCallback((token: string) => {
    setRaw((current) => (current.trim() ? `${current.trim()} ${token}` : token));
  }, []);

  const moveActive = useCallback((delta: 1 | -1) => {
    const n = results.length;
    if (n === 0) return;
    setActiveIndex((i) => (delta > 0 ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
  }, [results.length]);

  const oldest = results.length > 0 ? results[results.length - 1].createdAt : null;
  const loadMore = useMemo(
    () => (oldest !== null ? () => { void runSearch(parsed, { until: oldest - 1 }); } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oldest, runSearch, queryKey],
  );

  return {
    raw,
    setRaw,
    parsed,
    entityQuery,
    hasStructuredTokens,
    groups,
    groupById,
    channelMatches,
    results,
    busy,
    error,
    partial,
    relayFiltered,
    relaySearchable,
    loadingMore,
    loadMore,
    submit,
    thisChannelOnly,
    canScopeToChannel: activeGroupId !== null && parsed.groupIds.length === 0,
    toggleScope: () => setThisChannelOnly((v) => !v),
    activeIndex,
    setActiveIndex,
    moveActive,
    history,
    clearHistory: () => { wipeHistory(); setHistory([]); },
    applyFilter,
    jumpTo,
  };
}
