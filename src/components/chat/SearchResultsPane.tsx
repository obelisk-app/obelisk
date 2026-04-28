'use client';

import { useMemo, useRef, useState } from 'react';
import { useSearchStore, SearchResult, SortMode, ActiveFilters } from '@/store/search';
import { useChatStore } from '@/store/chat';
import { useT } from '@/store/locale';
import { formatPubkey } from '@/lib/nostr';
import HighlightedText from './search/HighlightedText';
import { useClickOutside } from '@/hooks/useClickOutside';

function SortMenu({ value, onChange }: { value: SortMode; onChange: (v: SortMode) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, () => setOpen(false), { enabled: open });

  const options: { value: SortMode; label: string }[] = [
    { value: 'relevance', label: t('search.sort.relevance') },
    { value: 'newest', label: t('search.sort.newest') },
    { value: 'oldest', label: t('search.sort.oldest') },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="lc-pill-secondary inline-flex items-center gap-2 text-sm"
        data-testid="search-sort-button"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h13M3 12h9M3 18h5" />
          <path d="M17 15l4 4-4 4" />
          <path d="M21 19H9" />
        </svg>
        {t('search.toolbar.sort')}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-lc-dark border border-lc-border rounded-xl shadow-lg z-50 py-1 min-w-[160px]" data-testid="search-sort-menu">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm hover:bg-lc-border/40 ${value === o.value ? 'text-lc-green' : 'text-lc-white'}`}
              data-testid={`search-sort-option-${o.value}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChips({ filters, onRemove }: { filters: ActiveFilters; onRemove: (k: keyof ActiveFilters) => void }) {
  const entries: { key: keyof ActiveFilters; label: string }[] = [];
  if (filters.from) entries.push({ key: 'from', label: `from: ${filters.from.name}` });
  if (filters.in) entries.push({ key: 'in', label: `in: ${filters.in.name}` });
  if (filters.mentions) entries.push({ key: 'mentions', label: `mentions: ${filters.mentions.name}` });
  if (filters.has) entries.push({ key: 'has', label: `has: ${filters.has}` });
  if (filters.before) entries.push({ key: 'before', label: `before: ${filters.before}` });
  if (filters.after) entries.push({ key: 'after', label: `after: ${filters.after}` });
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-b border-lc-border" data-testid="search-filter-chips">
      {entries.map((e) => (
        <button
          key={e.key}
          onClick={() => onRemove(e.key)}
          className="inline-flex items-center gap-1.5 bg-lc-olive/60 hover:bg-lc-olive text-lc-green text-xs font-medium px-2 py-1 rounded-full"
          data-testid={`search-chip-${e.key}`}
        >
          {e.label}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function ResultCard({
  result,
  searchTerms,
  profileCache,
  onJump,
}: {
  result: SearchResult;
  searchTerms: string[];
  profileCache: Map<string, { name?: string; picture?: string }>;
  onJump: (r: SearchResult) => void;
}) {
  const profile = profileCache.get(result.authorPubkey);
  const name = profile?.name || formatPubkey(result.authorPubkey);
  const time = new Date(result.createdAt);
  const dateStr = time.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: '2-digit' });
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <button
      onClick={() => onJump(result)}
      className="w-full text-left lc-card hover:border-lc-green/40 transition-colors p-3 mb-2"
      data-testid="search-result"
    >
      {result.replyTo && (
        <div className="flex items-center gap-2 text-xs text-lc-muted italic mb-2 pl-2 border-l-2 border-lc-border">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
          <span className="truncate">{result.replyTo.content || '—'}</span>
        </div>
      )}
      <div className="flex items-start gap-2">
        {profile?.picture ? (
          <img src={profile.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
            {name[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-lc-white truncate">{name}</span>
            <span className="text-xs text-lc-muted">{dateStr}, {timeStr}</span>
          </div>
          <div className="text-sm text-lc-white/90 break-words">
            <HighlightedText text={result.content} terms={searchTerms} />
          </div>
        </div>
      </div>
    </button>
  );
}

interface Props {
  serverId: string | null;
  profileCache: Map<string, { name?: string; picture?: string }>;
  onRequery: (append: boolean) => void;
}

export default function SearchResultsPane({ serverId, profileCache, onRequery }: Props) {
  const t = useT();
  const { query, results, isSearching, hasMore, sort, activeFilters, setSort, removeFilter, openPicker } = useSearchStore();
  const { userSelectChannel: setActiveChannel } = useChatStore();

  const searchTerms = useMemo(() => {
    return query
      .replace(/(from|in|has|before|after|mentions):\S+/gi, '')
      .replace(/"([^"]+)"/g, '$1')
      .split(/\s+/)
      .filter(Boolean);
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, { channelName: string; items: SearchResult[] }>();
    for (const r of results) {
      const existing = map.get(r.channelId);
      if (existing) existing.items.push(r);
      else map.set(r.channelId, { channelName: r.channelName, items: [r] });
    }
    return Array.from(map.entries());
  }, [results]);

  const handleJump = (r: SearchResult) => {
    setActiveChannel(r.channelId);
    useChatStore.setState({ highlightedMessageId: r.id });
    useSearchStore.getState().clearSearch();
  };

  const handleSort = (s: SortMode) => {
    setSort(s);
    onRequery(false);
  };

  const handleRemoveFilter = (k: keyof ActiveFilters) => {
    removeFilter(k);
    onRequery(false);
  };

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-lc-black" data-testid="search-results-pane">
      <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-lc-border shrink-0">
        <button
          onClick={() => openPicker('more')}
          className="lc-pill-secondary inline-flex items-center gap-2 text-sm"
          data-testid="search-filters-button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="13" y2="6" />
            <circle cx="17" cy="6" r="2" />
            <line x1="4" y1="12" x2="7" y2="12" />
            <circle cx="11" cy="12" r="2" />
            <line x1="15" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="15" y2="18" />
            <circle cx="19" cy="18" r="2" />
          </svg>
          {t('search.toolbar.filters')}
        </button>
        <SortMenu value={sort} onChange={handleSort} />
      </div>

      <FilterChips filters={activeFilters} onRemove={handleRemoveFilter} />

      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {isSearching && results.length === 0 && (
          <div className="text-center text-sm text-lc-muted py-8">{t('search.searching')}</div>
        )}
        {!isSearching && results.length === 0 && (
          <div className="text-center text-sm text-lc-muted py-8" data-testid="search-pane-no-results">
            {t('search.noResults')}
          </div>
        )}
        {grouped.map(([channelId, group]) => (
          <div key={channelId} className="mb-4">
            <div className="flex items-center gap-2 text-sm text-lc-muted mb-2">
              <span className="text-lc-white/80 font-semibold">#</span>
              <span className="font-semibold text-lc-white">{group.channelName}</span>
            </div>
            {group.items.map((r) => (
              <ResultCard
                key={r.id}
                result={r}
                searchTerms={searchTerms}
                profileCache={profileCache}
                onJump={handleJump}
              />
            ))}
          </div>
        ))}
        {hasMore && !isSearching && (
          <button
            onClick={() => onRequery(true)}
            className="w-full py-2 text-sm text-lc-muted hover:text-lc-green transition-colors"
            data-testid="search-load-more"
          >
            {t('search.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}
