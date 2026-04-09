'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useSearchStore, SearchResult } from '@/store/search';
import { useChatStore } from '@/store/chat';
import { formatPubkey } from '@/lib/nostr';

const FILTER_HINTS = [
  { prefix: 'from:', description: 'Messages from a user' },
  { prefix: 'in:', description: 'Messages in a channel' },
  { prefix: 'has:', description: 'link, image, video, file' },
  { prefix: 'before:', description: 'Before date (YYYY-MM-DD)' },
  { prefix: 'after:', description: 'After date (YYYY-MM-DD)' },
  { prefix: 'mentions:', description: 'Messages mentioning a user' },
];

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>;

  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-lc-green/30 text-lc-white rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function SearchResultItem({
  result,
  searchTerms,
  profileCache,
  onJump,
}: {
  result: SearchResult;
  searchTerms: string[];
  profileCache: Map<string, { name?: string; picture?: string }>;
  onJump: (result: SearchResult) => void;
}) {
  const profile = profileCache.get(result.authorPubkey);
  const displayName = profile?.name || formatPubkey(result.authorPubkey);
  const time = new Date(result.createdAt);
  const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <button
      onClick={() => onJump(result)}
      className="w-full text-left px-3 py-2.5 hover:bg-lc-border/30 transition-colors border-b border-lc-border/50 last:border-b-0"
      data-testid="search-result"
    >
      <div className="flex items-center gap-2 mb-1">
        {profile?.picture ? (
          <img src={profile.picture} alt="" className="w-5 h-5 rounded-full object-cover" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-[10px] font-semibold">
            {displayName[0]?.toUpperCase() || '?'}
          </div>
        )}
        <span className="text-xs font-semibold text-lc-white">{displayName}</span>
        <span className="text-xs text-lc-muted">in #{result.channelName}</span>
        <span className="text-xs text-lc-muted ml-auto">{dateStr} {timeStr}</span>
      </div>
      <div className="text-sm text-lc-white/80 line-clamp-2">
        <HighlightedText text={result.content} terms={searchTerms} />
      </div>
    </button>
  );
}

export default function SearchBar({
  serverId,
  profileCache,
}: {
  serverId: string | null;
  profileCache: Map<string, { name?: string; picture?: string }>;
}) {
  const { query, results, isSearching, isOpen, hasMore, cursor, setQuery, setResults, appendResults, setIsSearching, setIsOpen, clearSearch } = useSearchStore();
  const { setActiveChannel } = useChatStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showHints, setShowHints] = useState(false);

  const doSearch = useCallback(async (q: string, append = false) => {
    if (!q.trim() || !serverId) return;
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q, serverId });
      if (append && cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/search?${params}`);
      if (res.ok) {
        const data = await res.json();
        if (append) {
          appendResults(data.results, data.nextCursor, !!data.nextCursor);
        } else {
          setResults(data.results, data.nextCursor, !!data.nextCursor);
        }
      }
    } finally {
      setIsSearching(false);
    }
  }, [serverId, cursor, setIsSearching, setResults, appendResults]);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([], null, false);
      return;
    }
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }, [setQuery, setResults, doSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSearch();
    }
  };

  const handleJump = useCallback((result: SearchResult) => {
    // Navigate to the channel and set highlighted message
    setActiveChannel(result.channelId);
    // Store highlighted message id for MessageArea to scroll to
    useChatStore.setState({ highlightedMessageId: result.id });
    clearSearch();
  }, [setActiveChannel, clearSearch]);

  // Extract search terms for highlighting
  const searchTerms = query
    .replace(/(from|in|has|before|after|mentions):\S+/gi, '')
    .replace(/"([^"]+)"/g, '$1')
    .split(/\s+/)
    .filter(Boolean);

  // Close on click outside
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        clearSearch();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, clearSearch]);

  if (!isOpen) {
    return (
      <button
        onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="p-1.5 rounded-lg hover:bg-lc-border/40 text-lc-muted hover:text-lc-white transition-colors"
        title="Search messages"
        data-testid="search-toggle"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative" data-testid="search-bar">
      <div className="flex items-center gap-2 bg-lc-black border border-lc-border rounded-lg px-3 py-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted shrink-0">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowHints(true)}
          onBlur={() => setTimeout(() => setShowHints(false), 200)}
          placeholder="Search messages..."
          className="flex-1 bg-transparent text-sm text-lc-white placeholder:text-lc-muted focus:outline-none min-w-[200px]"
          data-testid="search-input"
        />
        {isSearching && <div className="lc-spinner" style={{ width: 14, height: 14 }} />}
        <button
          onClick={clearSearch}
          className="text-lc-muted hover:text-lc-white transition-colors"
          data-testid="search-close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Filter hints */}
      {showHints && !query && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-lc-dark border border-lc-border rounded-xl shadow-lg z-50 py-2" data-testid="search-hints">
          <div className="px-3 py-1 text-xs text-lc-muted font-medium">Search filters</div>
          {FILTER_HINTS.map((hint) => (
            <button
              key={hint.prefix}
              onMouseDown={(e) => { e.preventDefault(); handleInputChange(hint.prefix); inputRef.current?.focus(); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-lc-border/30 transition-colors flex items-center gap-2"
            >
              <code className="text-lc-green text-xs">{hint.prefix}</code>
              <span className="text-lc-muted text-xs">{hint.description}</span>
            </button>
          ))}
        </div>
      )}

      {/* Results dropdown */}
      {query && (results.length > 0 || isSearching) && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-lc-dark border border-lc-border rounded-xl shadow-lg z-50 max-h-96 overflow-y-auto" data-testid="search-results">
          {results.map((result) => (
            <SearchResultItem
              key={result.id}
              result={result}
              searchTerms={searchTerms}
              profileCache={profileCache}
              onJump={handleJump}
            />
          ))}
          {hasMore && !isSearching && (
            <button
              onClick={() => doSearch(query, true)}
              className="w-full py-2 text-sm text-lc-muted hover:text-lc-green transition-colors"
              data-testid="search-load-more"
            >
              Load more results
            </button>
          )}
          {isSearching && results.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-lc-muted">Searching...</div>
          )}
        </div>
      )}

      {/* No results */}
      {query && !isSearching && results.length === 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-lc-dark border border-lc-border rounded-xl shadow-lg z-50 py-4" data-testid="search-no-results">
          <p className="text-center text-sm text-lc-muted">No results found</p>
        </div>
      )}
    </div>
  );
}
