'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchStore, buildEffectiveQuery, type PickerMode } from '@/store/search';
import { useSearchHistoryStore } from '@/store/searchHistory';
import { useT } from '@/store/locale';
import FilterPicker from './search/FilterPicker';

interface FilterRow {
  mode: Exclude<PickerMode, null>;
  titleKey: string;
  exampleKey: string;
  icon: React.ReactNode;
}

const FILTER_ROWS: FilterRow[] = [
  {
    mode: 'from',
    titleKey: 'search.filters.fromUser.title',
    exampleKey: 'search.filters.fromUser.example',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    mode: 'in',
    titleKey: 'search.filters.inChannel.title',
    exampleKey: 'search.filters.inChannel.example',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="4" y1="15" x2="20" y2="15" />
        <line x1="10" y1="3" x2="8" y2="21" />
        <line x1="16" y1="3" x2="14" y2="21" />
      </svg>
    ),
  },
  {
    mode: 'has',
    titleKey: 'search.filters.has.title',
    exampleKey: 'search.filters.has.example',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 1 1-2.83-2.83l8.49-8.48" />
      </svg>
    ),
  },
  {
    mode: 'mentions',
    titleKey: 'search.filters.mentions.title',
    exampleKey: 'search.filters.mentions.example',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
      </svg>
    ),
  },
  {
    mode: 'more',
    titleKey: 'search.filters.more.title',
    exampleKey: 'search.filters.more.example',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="6" x2="13" y2="6" />
        <circle cx="17" cy="6" r="2" />
        <line x1="4" y1="12" x2="7" y2="12" />
        <circle cx="11" cy="12" r="2" />
        <line x1="15" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="15" y2="18" />
        <circle cx="19" cy="18" r="2" />
      </svg>
    ),
  },
];

export default function SearchBar({
  serverId,
  profileCache,
}: {
  serverId: string | null;
  profileCache: Map<string, { name?: string; picture?: string }>;
}) {
  const t = useT();
  const {
    query,
    isSearching,
    isOpen,
    cursor,
    activeFilters,
    pickerMode,
    setQuery,
    setResults,
    appendResults,
    setIsSearching,
    setIsOpen,
    clearSearch,
    openPicker,
  } = useSearchStore();
  const allHistory = useSearchHistoryStore((s) => s.entries);
  const historyEntries = useMemo(
    () =>
      serverId
        ? allHistory.filter((e) => e.serverId === serverId).sort((a, b) => b.at - a.at)
        : [],
    [allHistory, serverId]
  );
  const pushHistory = useSearchHistoryStore((s) => s.push);
  const removeHistory = useSearchHistoryStore((s) => s.remove);
  const clearHistory = useSearchHistoryStore((s) => s.clear);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const doSearch = useCallback(async (append = false) => {
    if (!serverId) return;
    const effective = buildEffectiveQuery(query, activeFilters);
    if (!effective.trim()) {
      setResults([], null, false);
      return;
    }
    setIsSearching(true);
    setIsOpen(true);
    try {
      const params = new URLSearchParams({ q: effective, serverId });
      const state = useSearchStore.getState();
      params.set('sort', state.sort);
      if (append && cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          appendResults(data.results, data.nextCursor, !!data.nextCursor);
        } else {
          setResults(data.results, data.nextCursor, !!data.nextCursor);
          if (query.trim()) pushHistory(query.trim(), serverId);
        }
      }
    } finally {
      setIsSearching(false);
    }
  }, [serverId, query, activeFilters, cursor, setIsSearching, setIsOpen, setResults, appendResults, pushHistory]);

  // Expose the requery fn to parent via window event — simpler than prop drilling
  // so SearchResultsPane (mounted in chat page) can trigger it.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ append?: boolean }>).detail;
      doSearch(!!detail?.append);
    };
    window.addEventListener('obelisk:search:requery', handler as EventListener);
    return () => window.removeEventListener('obelisk:search:requery', handler as EventListener);
  }, [doSearch]);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const effective = buildEffectiveQuery(value, activeFilters);
    if (!effective.trim()) {
      setResults([], null, false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(false), 300);
  }, [setQuery, setResults, doSearch, activeFilters]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSearch();
      setShowDropdown(false);
    }
  };

  const runHistory = useCallback((q: string) => {
    setQuery(q);
    setShowDropdown(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // wait a tick for state flush
    setTimeout(() => doSearch(false), 0);
  }, [setQuery, doSearch]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  const showFiltersDropdown = showDropdown && !query.trim() && !pickerMode;

  return (
    <div ref={containerRef} className="relative" data-testid="search-bar">
      <div
        className="flex items-center gap-2 bg-lc-black border border-lc-border rounded-lg px-3 py-1.5"
        onClick={() => {
          setShowDropdown(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowDropdown(true)}
          placeholder={t('search.placeholder')}
          className="flex-1 bg-transparent text-sm text-lc-white placeholder:text-lc-muted focus:outline-none min-w-[200px]"
          data-testid="search-input"
        />
        {isSearching && <div className="lc-spinner" style={{ width: 14, height: 14 }} />}
        {query ? (
          <button
            onClick={(e) => { e.stopPropagation(); clearSearch(); setShowDropdown(false); }}
            className="text-lc-muted hover:text-lc-white transition-colors"
            data-testid="search-close"
            aria-label="Clear search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}
      </div>

      {showFiltersDropdown && (
        <div className="absolute top-full mt-1 right-0 w-[420px] bg-lc-dark border border-lc-border rounded-xl shadow-lg z-40 py-2" data-testid="search-hints">
          <div className="px-3 py-1 text-xs text-lc-muted font-medium">{t('search.filters.title')}</div>
          {FILTER_ROWS.map((row) => (
            <button
              key={row.mode}
              onMouseDown={(e) => { e.preventDefault(); openPicker(row.mode); setShowDropdown(false); }}
              className="w-full text-left px-3 py-2 hover:bg-lc-border/30 transition-colors flex items-start gap-3"
              data-testid={`search-filter-row-${row.mode}`}
            >
              <span className="text-lc-muted mt-0.5 shrink-0">{row.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-lc-white">{t(row.titleKey)}</span>
                <span className="block text-xs text-lc-muted">{t(row.exampleKey)}</span>
              </span>
            </button>
          ))}

          <div className="flex items-center justify-between px-3 pt-3 pb-1 border-t border-lc-border/50 mt-1">
            <span className="text-xs text-lc-muted font-medium">{t('search.history.title')}</span>
            {serverId && historyEntries.length > 0 && (
              <button
                onMouseDown={(e) => { e.preventDefault(); clearHistory(serverId); }}
                className="text-lc-muted hover:text-lc-white transition-colors"
                title={t('search.history.clear')}
                aria-label={t('search.history.clear')}
                data-testid="search-history-clear"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
          {historyEntries.length === 0 ? (
            <div className="px-3 py-2 text-xs text-lc-muted">{t('search.history.empty')}</div>
          ) : (
            historyEntries.map((entry) => (
              <div
                key={entry.query}
                className="group w-full flex items-center gap-2 px-3 py-1.5 hover:bg-lc-border/30 transition-colors"
                data-testid="search-history-row"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted shrink-0">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <button
                  onMouseDown={(e) => { e.preventDefault(); runHistory(entry.query); }}
                  className="flex-1 text-left text-sm text-lc-white truncate"
                >
                  {entry.query}
                </button>
                <button
                  onMouseDown={(e) => { e.preventDefault(); removeHistory(entry.query, entry.serverId); }}
                  className="text-lc-muted opacity-0 group-hover:opacity-100 hover:text-lc-white transition-opacity"
                  aria-label="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {pickerMode && (
        <FilterPicker
          profileCache={profileCache}
          onChange={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            setTimeout(() => doSearch(false), 0);
          }}
        />
      )}
    </div>
  );
}
