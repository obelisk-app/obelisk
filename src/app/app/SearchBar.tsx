'use client';

/**
 * Discord-style search bar that runs NIP-50 queries against the active relay.
 *
 * Grammar lives in `src/lib/search-query.ts` (parsed there so it can be unit
 * tested and shared with the mobile screen):
 *   from:<npub|hex|name>     → author filter
 *   in:<group id|name>       → restrict to a NIP-29 group (`#h`)
 *   mentions:<npub|hex|name> → `#p` filter
 *   has:link|image|file      → client-side content filter
 *   before:/after:<date>     → `until` / `since`
 *   "quoted phrase"          → matched literally
 *
 * Two behaviours worth knowing:
 *
 * - **Multi-word queries are ANDed client-side.** Relays match the NIP-50
 *   `search` value as a literal substring of the whole string, so sending
 *   "hola mundo" verbatim returns nothing. The bridge sends only the most
 *   selective term and filters the rest locally.
 * - **`from:`/`in:` accept names, not just ids.** They resolve against the
 *   relay's known people and the user's channels. A value that resolves to
 *   nothing is reported in the pane rather than silently dropped — the old
 *   behaviour made `from:alice` look like "no results".
 */
import { displayNameFor } from '@/lib/display-name';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nip19 } from 'nostr-tools';
import {
  nostrActions,
  useGroups,
  useRelayPeople,
  useCurrentRelayUrl,
  type JsGroup,
  type JsSearchHit,
} from '@/lib/nostr-bridge';
import { useUserMetadata as useProfile } from '@/lib/nostr-bridge';
import { useNostrUserSearch, type UserHit } from '@/lib/hooks/useNostrUserSearch';
import { searchGroups } from '@/lib/group-search';
import {
  parseSearchQuery,
  isEmptyQuery,
  nameMatches,
  type ParsedQuery,
} from '@/lib/search-query';
import { fetchRelayInfo, supportsSearch } from '@/lib/relay-info';
import { formatPubkey } from '@nostr-wot/data';
import { useChatStore } from '@/store/chat';
import { useTranslation } from '@/i18n/context';
import { useFormat } from '@/i18n/useFormat';

const HISTORY_KEY = 'obelisk-dex/search-history';
const HISTORY_MAX = 10;
const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 30;

function decodeNpub(s: string): string | null {
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase();
  if (s.startsWith('npub1') || s.startsWith('nprofile1')) {
    try {
      const decoded = nip19.decode(s);
      if (decoded.type === 'npub') return decoded.data as string;
      if (decoded.type === 'nprofile') return (decoded.data as { pubkey: string }).pubkey;
    } catch { /* not a valid bech32 identity */ }
  }
  return null;
}

function loadHistory(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}

function pushHistory(q: string): string[] {
  const trimmed = q.trim();
  const cur = loadHistory().filter((x) => x !== trimmed);
  if (!trimmed || typeof window === 'undefined') return cur;
  const next = [trimmed, ...cur].slice(0, HISTORY_MAX);
  try { window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

function clearHistory() {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

export default function SearchBar({
  serverName,
  activeGroupId,
  onJump,
}: {
  serverName: string;
  activeGroupId: string | null;
  onJump?: (msg: JsSearchHit) => void;
}) {
  const { t } = useTranslation();
  const [raw, setRaw] = useState('');
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [thisChannelOnly, setThisChannelOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ReadonlyArray<JsSearchHit>>([]);
  const [partial, setPartial] = useState(false);
  const [relayFiltered, setRelayFiltered] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadingMore, setLoadingMore] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const groups = useGroups();
  const people = useRelayPeople();
  const relayUrl = useCurrentRelayUrl();

  // Does the active relay honour NIP-50? A relay that doesn't ignores the
  // `search` field and hands back unfiltered recent events, which we must
  // not present as search hits.
  const [relaySearchable, setRelaySearchable] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void fetchRelayInfo(relayUrl).then((info) => {
      if (!cancelled) setRelaySearchable(supportsSearch(info));
    });
    return () => { cancelled = true; };
  }, [relayUrl]);

  // `from:alice` / `in:general` resolve against who and what we know about.
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

  useEffect(() => { setHistory(loadHistory()); }, []);

  const closeAll = useCallback(() => {
    setOpen(false);
    // The mobile input is a fixed full-width overlay; leaving it expanded
    // pins it over the header with its own trigger button hidden.
    setMobileExpanded(false);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeAll();
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [closeAll]);

  // One shared guard for every in-flight search: a response whose id is no
  // longer current is dropped, so a slow early query can't overwrite a fast
  // later one, and nothing is set after unmount.
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

  // Live, debounced search. Typing used to do nothing until you pressed
  // Enter — while the Users and Channels sections updated live — which made
  // the whole bar read as broken.
  const queryKey = JSON.stringify([
    parsed.terms, parsed.authors, parsed.mentions, parsed.groupIds,
    parsed.has, parsed.since, parsed.until, thisChannelOnly,
  ]);
  useEffect(() => {
    // Any change to the query invalidates what's on screen. Clearing here
    // (rather than only on success) stops the previous query's hits and
    // count from being shown against the new text.
    reqRef.current++;
    setResults([]);
    setError(null);
    setPartial(false);
    setActiveIndex(-1);
    if (isEmptyQuery(parsed)) { setBusy(false); return; }
    setBusy(true);
    const handle = setTimeout(() => { void runSearch(parsed); }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // `parsed` is rebuilt every render; `queryKey` is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, runSearch]);

  const commit = useCallback((text: string) => {
    setHistory(pushHistory(text));
  }, []);

  const jumpTo = useCallback((m: JsSearchHit) => {
    if (onJump) onJump(m);
    // Default behaviour when the host doesn't override it: ask the shell to
    // switch channel and scroll to the message. Without this, clicking a
    // result only closed the dropdown.
    else if (m.groupId) useChatStore.getState().requestJump(m.groupId, m.id);
    commit(raw);
    closeAll();
  }, [onJump, raw, commit, closeAll]);

  function applyFilter(token: string) {
    const next = raw.trim() ? `${raw.trim()} ${token}` : token;
    setRaw(next);
    setOpen(true);
    // Without this the caret is stranded on the button that was clicked.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (raw) setRaw(''); else closeAll();
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      jumpTo(results[activeIndex]);
    }
  }

  const oldest = results.length > 0 ? results[results.length - 1].createdAt : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setMobileExpanded(true);
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        className={
          'sm:hidden rounded-md p-2 text-lc-muted hover:text-lc-white hover:bg-lc-card ' +
          (mobileExpanded ? 'hidden' : '')
        }
        aria-label={t('search.open')}
      >
        <SearchIcon size={20} />
      </button>
      <form
        onSubmit={(e) => { e.preventDefault(); commit(raw); void runSearch(parsed); }}
        className={
          'items-center gap-2 rounded-md border border-lc-border bg-lc-dark sm:bg-lc-black/40 focus-within:border-lc-green/60 ' +
          'max-sm:fixed max-sm:inset-x-2 max-sm:top-2 max-sm:z-50 max-sm:px-3 max-sm:py-2.5 max-sm:shadow-2xl ' +
          'sm:px-3 sm:py-2 sm:w-56 md:w-80 ' +
          (mobileExpanded ? 'flex' : 'hidden sm:flex')
        }
      >
        <input
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('search.placeholderIn').replace('{server}', serverName)}
          className="flex-1 min-w-0 bg-transparent text-sm sm:text-xs text-lc-white outline-none placeholder:text-lc-muted"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results-pane"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
        />
        <button type="submit" className="text-lc-muted hover:text-lc-white shrink-0" aria-label={t('common.search')}>
          <SearchIcon size={18} />
        </button>
        <button
          type="button"
          onClick={() => { closeAll(); setRaw(''); }}
          className="sm:hidden text-lc-muted hover:text-lc-white shrink-0"
          aria-label={t('search.close')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </form>

      {open && (
        <div
          id="search-results-pane"
          // On mobile the input is a fixed overlay at the top of the
          // viewport, so the pane has to anchor to the viewport too —
          // anchoring to the (hidden) trigger button detached it from the
          // input and overflowed narrow screens.
          className={
            'overflow-y-auto rounded-xl border border-lc-border bg-lc-dark shadow-2xl z-50 ' +
            'max-sm:fixed max-sm:inset-x-2 max-sm:top-16 max-sm:max-h-[70vh] ' +
            'sm:absolute sm:right-0 sm:top-full sm:mt-1 sm:w-[420px] sm:max-h-[70vh]'
          }
        >
          {!raw.trim() ? (
            <FilterAndHistoryPane
              serverName={serverName}
              history={history}
              t={t}
              onPickFilter={applyFilter}
              onPickHistory={(h) => { setRaw(h); setOpen(true); }}
              onClearHistory={() => { clearHistory(); setHistory([]); }}
            />
          ) : (
            <ResultsPane
              raw={raw}
              parsed={parsed}
              busy={busy}
              error={error}
              results={results}
              groups={groups}
              activeIndex={activeIndex}
              partial={partial}
              relayFiltered={relayFiltered}
              relaySearchable={relaySearchable}
              thisChannelOnly={thisChannelOnly}
              canScopeToChannel={activeGroupId !== null && parsed.groupIds.length === 0}
              onToggleScope={() => setThisChannelOnly((v) => !v)}
              loadingMore={loadingMore}
              onLoadMore={oldest !== null ? () => void runSearch(parsed, { until: oldest - 1 }) : undefined}
              onPickFilter={applyFilter}
              t={t}
              onJump={jumpTo}
              onClose={closeAll}
              onPreviewUser={(pk) => { useChatStore.getState().openProfilePopup(pk); closeAll(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function FilterAndHistoryPane({
  history, t, serverName, onPickFilter, onPickHistory, onClearHistory,
}: {
  history: string[];
  t: (key: string) => string;
  serverName: string;
  onPickFilter: (token: string) => void;
  onPickHistory: (q: string) => void;
  onClearHistory: () => void;
}) {
  return (
    <>
      {/*
        Scope, not decoration: this pane is NIP-50 over one relay's channels,
        while the feed's search is the open network. They looked identical.
      */}
      <div className="flex items-center justify-between gap-2 border-b border-lc-border px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-lc-muted">{t('search.filters.title')}</span>
        <span
          className="shrink-0 truncate rounded-full border border-lc-border px-2 py-0.5 text-[10px] font-semibold text-lc-muted"
          data-testid="search-scope-badge"
        >
          {t('search.scopeThisRelay').replace('{server}', serverName)}
        </span>
      </div>
      <FilterRow icon="👤" title={t('search.filters.fromUser.title')} hint={t('search.filters.fromUser.example')} onClick={() => onPickFilter('from:')} />
      <FilterRow icon="#" title={t('search.filters.inChannel.title')} hint={t('search.filters.inChannel.example')} onClick={() => onPickFilter('in:')} />
      <FilterRow icon="🔗" title={t('search.filters.has.title')} hint={t('search.filters.has.example')} onClick={() => onPickFilter('has:link')} />
      <FilterRow icon="@" title={t('search.filters.mentions.title')} hint={t('search.filters.mentions.example')} onClick={() => onPickFilter('mentions:')} />
      <FilterRow icon="📅" title={t('search.filters.date.title')} hint={t('search.filters.date.example')} onClick={() => onPickFilter('after:')} />
      {history.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-t border-lc-border">
            <span>{t('search.history.title')}</span>
            <button onClick={onClearHistory} className="text-lc-muted hover:text-lc-white" aria-label={t('search.history.clear')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
              </svg>
            </button>
          </div>
          {history.map((h) => (
            <button
              key={h}
              onClick={() => onPickHistory(h)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lc-white hover:bg-lc-card"
            >
              <span className="text-lc-muted shrink-0"><SearchIcon size={14} /></span>
              <span className="truncate">{h}</span>
            </button>
          ))}
        </>
      )}
    </>
  );
}

function FilterRow({ icon, title, hint, onClick }: { icon: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-lc-card">
      <span className="mt-0.5 w-6 text-center text-base text-lc-muted">{icon}</span>
      <span className="flex-1 min-w-0">
        <div className="text-sm text-lc-white">{title}</div>
        <div className="text-xs text-lc-muted">{hint}</div>
      </span>
    </button>
  );
}

function ResultsPane({
  raw, parsed, busy, error, results, groups, activeIndex, partial, relayFiltered,
  relaySearchable, thisChannelOnly, canScopeToChannel, onToggleScope, loadingMore,
  onLoadMore, t, onPickFilter, onJump, onClose, onPreviewUser,
}: {
  raw: string;
  parsed: ParsedQuery;
  busy: boolean;
  error: string | null;
  results: ReadonlyArray<JsSearchHit>;
  groups: ReadonlyArray<JsGroup>;
  activeIndex: number;
  partial: boolean;
  relayFiltered: boolean;
  relaySearchable: boolean;
  thisChannelOnly: boolean;
  canScopeToChannel: boolean;
  onToggleScope: () => void;
  loadingMore: boolean;
  onLoadMore?: () => void;
  t: (key: string) => string;
  onPickFilter: (token: string) => void;
  onJump: (m: JsSearchHit) => void;
  onClose: () => void;
  onPreviewUser: (pubkey: string) => void;
}) {
  // When the user is composing a structured token query (`from:`, `in:`,
  // `mentions:`, `has:`), they're searching messages — hide the entity
  // sections to avoid noise. Otherwise show Users + Channels alongside
  // Messages so a single bar covers all three discovery paths.
  const hasStructuredTokens = /(^|\s)(from|in|mentions|has|before|after):/i.test(raw);
  const showEntities = !hasStructuredTokens && raw.trim().length >= 1;
  const userQuery = showEntities ? parsed.terms.map((x) => x.text).join(' ') : '';

  // One lookup for the whole pane. This used to be a `useGroups()` call
  // inside every result row.
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) if (g.name) m.set(g.id, g.name);
    return m;
  }, [groups]);

  return (
    <>
      {showEntities && <UsersSection query={userQuery} t={t} onPreviewUser={onPreviewUser} />}
      {showEntities && <ChannelsSection query={userQuery} t={t} onClose={onClose} />}
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
        <span data-testid="search-messages-header" aria-live="polite">
          {busy ? t('search.messagesSearching') : t('search.messagesHeader').replace('{count}', String(results.length))}
        </span>
        {canScopeToChannel && (
          <button
            type="button"
            onClick={onToggleScope}
            className={
              'ml-auto rounded-full border px-2 py-0.5 text-[10px] normal-case tracking-normal font-medium transition-colors ' +
              (thisChannelOnly
                ? 'border-lc-green/40 bg-lc-green/15 text-lc-green'
                : 'border-lc-border text-lc-muted hover:text-lc-white')
            }
            aria-pressed={thisChannelOnly}
            data-testid="search-scope-toggle"
          >
            {thisChannelOnly ? t('search.scope.channel') : t('search.scope.relay')}
          </button>
        )}
      </div>

      {parsed.unresolved.length > 0 && (
        <div className="px-3 py-2 text-xs text-amber-300/90" data-testid="search-unresolved">
          {parsed.unresolved.map((u) => (
            <div key={`${u.key}:${u.value}`}>
              {t('search.unresolved').replace('{token}', `${u.key}:${u.value}`)}
            </div>
          ))}
        </div>
      )}
      {!relaySearchable && (
        <div className="px-3 py-2 text-xs text-amber-300/90" data-testid="search-no-nip50">
          {t('search.noNip50')}
        </div>
      )}
      {error && <div className="px-3 py-2 text-xs text-red-400">{error}</div>}
      {!busy && results.length === 0 && !error && (
        <div className="px-3 py-3 text-center text-xs text-lc-muted">
          {isEmptyQuery(parsed) ? t('search.messagesPrompt') : t('search.noMatches')}
        </div>
      )}

      <div role="listbox" aria-label={t('search.messagesHeader').replace(' · {count}', '')}>
        {results.map((m, i) => (
          <ResultRow
            key={m.id}
            id={`search-result-${i}`}
            active={i === activeIndex}
            msg={m}
            groupName={m.groupId ? groupNameById.get(m.groupId) ?? null : null}
            t={t}
            onJump={() => onJump(m)}
            onAuthor={(pk) => onPickFilter(`from:${pk}`)}
          />
        ))}
      </div>

      {results.length > 0 && partial && onLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full px-3 py-2 text-xs text-lc-muted hover:text-lc-white hover:bg-lc-card disabled:opacity-50"
          data-testid="search-load-more"
        >
          {loadingMore ? t('search.searching') : t('search.loadMore')}
        </button>
      )}
      {results.length > 0 && !relayFiltered && parsed.terms.length > 0 && (
        <div className="px-3 py-1.5 text-[10px] text-lc-muted">{t('search.localFilterNote')}</div>
      )}
    </>
  );
}

function UsersSection({ query, t, onPreviewUser }: { query: string; t: (key: string) => string; onPreviewUser: (pubkey: string) => void }) {
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(query);

  const rows: Array<{ key: string; hit: UserHit; badge?: string }> = [];
  if (directHit) rows.push({ key: `direct-${directHit.pubkey}`, hit: directHit, badge: 'npub' });
  if (nip05Hit && nip05Hit.pubkey !== directHit?.pubkey) {
    rows.push({ key: `nip05-${nip05Hit.pubkey}`, hit: nip05Hit, badge: 'NIP-05' });
  }
  for (const r of nostrResults) {
    if (r.pubkey === directHit?.pubkey || r.pubkey === nip05Hit?.pubkey) continue;
    rows.push({ key: `nostr-${r.pubkey}`, hit: r });
  }

  return (
    <section data-testid="search-users-section">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
        <span>{t('search.users')}</span>
        {loading && <span className="text-[10px] normal-case font-normal text-lc-muted">{t('search.searching')}</span>}
      </div>
      {rows.length === 0 && !loading && (
        <div className="px-3 py-2 text-xs text-lc-muted">{t('search.noMatches')}</div>
      )}
      {rows.map((r) => (
        <UserResultRow key={r.key} hit={r.hit} badge={r.badge} onPick={() => onPreviewUser(r.hit.pubkey)} />
      ))}
    </section>
  );
}

function UserResultRow({ hit, badge, onPick }: { hit: UserHit; badge?: string; onPick: () => void }) {
  const name = hit.displayName ?? formatPubkey(hit.pubkey);
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-lc-card border-b border-lc-border/40 last:border-b-0"
      data-testid="search-user-row"
      data-pubkey={hit.pubkey}
    >
      {hit.picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hit.picture} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
          {(name[0] || '?').toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-lc-white truncate">{name}</span>
          {badge && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-lc-green/15 text-lc-green border border-lc-green/30 shrink-0">
              {badge}
            </span>
          )}
        </div>
        <div className="text-[11px] text-lc-muted truncate">
          {hit.nip05 ?? formatPubkey(hit.pubkey)}
        </div>
      </div>
    </button>
  );
}

function ChannelsSection({ query, t, onClose }: { query: string; t: (key: string) => string; onClose: () => void }) {
  const groups = useGroups();
  const matches = useMemo(() => searchGroups(groups, query), [groups, query]);
  if (matches.length === 0) return null;

  const pick = (g: JsGroup) => {
    // `setActiveGroup` only moves the relay subscription — the shell decides
    // what's rendered, so calling it from here left the user staring at the
    // channel they were already in. Go through the shell.
    useChatStore.getState().requestJump(g.id);
    onClose();
  };

  return (
    <section data-testid="search-channels-section">
      <div className="flex items-center px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
        <span>{t('search.channels')}</span>
      </div>
      {matches.slice(0, 10).map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => pick(g)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-lc-card border-b border-lc-border/40 last:border-b-0"
          data-testid="search-channel-row"
          data-group-id={g.id}
        >
          {g.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={g.picture} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-md bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
              #
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm text-lc-white truncate">#{g.name ?? g.id.slice(0, 8)}</div>
            {g.about && <div className="text-[11px] text-lc-muted truncate">{g.about}</div>}
          </div>
        </button>
      ))}
    </section>
  );
}

function ResultRow({ id, active, msg, groupName, t, onJump, onAuthor }: {
  id: string;
  active: boolean;
  msg: JsSearchHit;
  groupName: string | null;
  t: (key: string) => string;
  onJump: () => void;
  onAuthor: (pk: string) => void;
}) {
  const { formatDateTime } = useFormat();
  const meta = useProfile(msg.pubkey);
  // `formatPubkey` gives `npub1abc…xyz`; a raw hex slice is not an identity
  // a human can recognise or copy.
  const name = displayNameFor(msg.pubkey, meta);
  const channel = groupName ?? (msg.groupId ? formatPubkey(msg.groupId) : '?');
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-testid="search-result-row"
      className={
        'px-3 py-2 border-b border-lc-border/40 last:border-b-0 ' +
        (active ? 'bg-lc-card' : 'hover:bg-lc-card')
      }
    >
      <div className="flex items-baseline gap-2 text-xs">
        <button onClick={() => onAuthor(msg.pubkey)} className="font-semibold text-lc-white hover:underline truncate">{name}</button>
        <span className="text-lc-muted">{t('search.in')}</span>
        <span className="text-lc-green truncate">#{channel}</span>
        <span className="ml-auto text-[10px] text-lc-muted">
          {formatDateTime(msg.createdAt)}
        </span>
      </div>
      <button onClick={onJump} className="mt-0.5 block w-full text-left text-sm text-lc-white/90 line-clamp-2">{msg.content}</button>
    </div>
  );
}
