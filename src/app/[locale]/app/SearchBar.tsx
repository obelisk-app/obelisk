'use client';

/**
 * Discord-style search bar over the active relay. The search itself
 * (grammar, debounce, race guard, NIP-11 probe, paging, history, keyboard
 * selection) is `useRelaySearch`, shared with the phone's `SearchScreen`.
 * This file is the desktop paint: the input, the dropdown and its two
 * panes (`search/FilterAndHistoryPane`, `search/ResultsPane`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JsSearchHit } from '@/services/nostr-bridge';
import { useRelaySearch } from '@/hooks/chat/useRelaySearch';
import { useChatStore } from '@/store/chat';
import { useTranslations } from 'next-intl';
import { FilterAndHistoryPane } from './search/FilterAndHistoryPane';
import { ResultsPane } from './search/ResultsPane';
import { SearchIcon } from './search/SearchIcon';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import CloseButton from '@/components/ui/CloseButton';

export default function SearchBar({
  serverName,
  activeGroupId,
  onJump,
}: {
  serverName: string;
  activeGroupId: string | null;
  onJump?: (msg: JsSearchHit) => void;
}) {
  const t = useTranslations();
  const search = useRelaySearch({ activeGroupId });
  const [open, setOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const jumpTo = (m: JsSearchHit) => {
    // A host may override where a hit goes; by default the shell is asked to
    // switch channel and scroll to the message. Without that fallback,
    // clicking a result only closed the dropdown.
    if (onJump) onJump(m);
    else if (m.groupId) useChatStore.getState().requestJump(m.groupId, m.id);
    search.jumpTo(m);
    closeAll();
  };

  const applyFilter = (token: string) => {
    search.applyFilter(token);
    setOpen(true);
    // Without this the caret is stranded on the button that was clicked.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (search.raw) search.setRaw(''); else closeAll();
      return;
    }
    if (search.results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      search.moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      search.moveActive(-1);
    } else if (e.key === 'Enter' && search.activeIndex >= 0) {
      e.preventDefault();
      jumpTo(search.results[search.activeIndex]);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      {/* Unmounted rather than `hidden` while expanded: Button's own
          `inline-flex` would outrank a `hidden` utility. */}
      {!mobileExpanded && (
        <Button
          variant="ghost"
          size="icon-md"
          onClick={() => {
            setMobileExpanded(true);
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="sm:hidden rounded-md"
          aria-label={t('shell.search.open')}
        >
          <SearchIcon size={20} />
        </Button>
      )}
      <form
        onSubmit={(e) => { e.preventDefault(); search.submit(); }}
        className={
          'items-center gap-2 rounded-md border border-lc-border bg-lc-dark sm:bg-lc-black/40 focus-within:border-lc-green/60 ' +
          'max-sm:fixed max-sm:inset-x-2 max-sm:top-2 max-sm:z-50 max-sm:px-3 max-sm:py-2.5 max-sm:shadow-2xl ' +
          'sm:px-3 sm:py-2 sm:w-56 md:w-80 ' +
          (mobileExpanded ? 'flex' : 'hidden sm:flex')
        }
      >
        <Input
          variant="bare"
          ref={inputRef}
          value={search.raw}
          onChange={(e) => search.setRaw(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('shell.search.placeholderIn', { server: serverName })}
          aria-label={t('shell.search.placeholderIn', { server: serverName })}
          className="flex-1 min-w-0 bg-transparent text-sm sm:text-xs text-lc-white outline-none placeholder:text-lc-muted"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results-pane"
          aria-autocomplete="list"
          aria-activedescendant={search.activeIndex >= 0 ? `search-result-${search.activeIndex}` : undefined}
        />
        <Button type="submit" variant="ghost" size="icon" className="shrink-0" aria-label={t('common.search')}>
          <SearchIcon size={18} />
        </Button>
        <CloseButton
          onClick={() => { closeAll(); search.setRaw(''); }}
          label={t('shell.search.close')}
          className="sm:hidden"
        />
      </form>

      {open && (
        <div
          id="search-results-pane"
          // On mobile the input is a fixed overlay at the top of the
          // viewport, so the pane has to anchor to the viewport too -
          // anchoring to the (hidden) trigger button detached it from the
          // input and overflowed narrow screens.
          className={
            'overflow-y-auto rounded-xl border border-lc-border bg-lc-dark shadow-2xl z-50 ' +
            'max-sm:fixed max-sm:inset-x-2 max-sm:top-16 max-sm:max-h-[70vh] ' +
            'sm:absolute sm:right-0 sm:top-full sm:mt-1 sm:w-[420px] sm:max-h-[70vh]'
          }
        >
          {!search.raw.trim() ? (
            <FilterAndHistoryPane
              serverName={serverName}
              history={search.history}
              t={t}
              onPickFilter={applyFilter}
              onPickHistory={(h) => { search.setRaw(h); setOpen(true); }}
              onClearHistory={search.clearHistory}
            />
          ) : (
            <ResultsPane
              raw={search.raw}
              parsed={search.parsed}
              busy={search.busy}
              error={search.error}
              results={search.results}
              groups={search.groups}
              channelMatches={search.channelMatches}
              entityQuery={search.entityQuery}
              hasStructuredTokens={search.hasStructuredTokens}
              activeIndex={search.activeIndex}
              partial={search.partial}
              relayFiltered={search.relayFiltered}
              relaySearchable={search.relaySearchable}
              thisChannelOnly={search.thisChannelOnly}
              canScopeToChannel={search.canScopeToChannel}
              onToggleScope={search.toggleScope}
              loadingMore={search.loadingMore}
              onLoadMore={search.loadMore}
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
