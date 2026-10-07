'use client';

/**
 * Discord-style search bar over the active relay. The search itself
 * (grammar, debounce, race guard, NIP-11 probe, paging, history, keyboard
 * selection) is `useRelaySearch`, shared with the phone's `SearchScreen`.
 * This file is the desktop paint: the input, the dropdown and its two
 * panes (`search/FilterAndHistoryPane`, `search/ResultsPane`).
 */
import { useRef } from 'react';
import type { JsSearchHit } from '@/services/nostr-bridge';
import { useSearchBar } from '@/hooks/shell/search/useSearchBar';
import { useTranslations } from 'next-intl';
import { FilterAndHistoryPane } from './FilterAndHistoryPane';
import { ResultsPane } from './ResultsPane';
import { SearchIcon } from './SearchIcon';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';
import CloseButton from '@/components/ui/buttons/CloseButton';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const vm = useSearchBar({ activeGroupId, onJump, inputRef, rootRef });
  const { search } = vm;

  return (
    <div ref={rootRef} className="relative">
      {/* Unmounted rather than `hidden` while expanded: Button's own
          `inline-flex` would outrank a `hidden` utility. */}
      {!vm.mobileExpanded && (
        <Button
          variant="ghost"
          size="icon-md"
          onClick={vm.expandMobile}
          className="sm:hidden rounded-md"
          aria-label={t('shell.search.open')}
        >
          <SearchIcon size={20} />
        </Button>
      )}
      <form
        onSubmit={vm.submit}
        className={
          'items-center gap-2 rounded-md border border-lc-border bg-lc-dark sm:bg-lc-black/40 focus-within:border-lc-green/60 ' +
          'max-sm:fixed max-sm:inset-x-2 max-sm:top-2 max-sm:z-50 max-sm:px-3 max-sm:py-2.5 max-sm:shadow-2xl ' +
          'sm:px-3 sm:py-2 sm:w-56 md:w-80 ' +
          (vm.mobileExpanded ? 'flex' : 'hidden sm:flex')
        }
      >
        <Input
          variant="bare"
          ref={inputRef}
          value={search.raw}
          onChange={(e) => search.setRaw(e.target.value)}
          onFocus={vm.openPane}
          onKeyDown={vm.onKeyDown}
          placeholder={t('shell.search.placeholderIn', { server: serverName })}
          aria-label={t('shell.search.placeholderIn', { server: serverName })}
          className="flex-1 min-w-0 bg-transparent text-sm sm:text-xs text-lc-white outline-none placeholder:text-lc-muted"
          role="combobox"
          aria-expanded={vm.open}
          aria-controls="search-results-pane"
          aria-autocomplete="list"
          aria-activedescendant={vm.activeDescendant}
        />
        <Button type="submit" variant="ghost" size="icon" className="shrink-0" aria-label={t('common.search')}>
          <SearchIcon size={18} />
        </Button>
        <CloseButton
          onClick={vm.closeAndClear}
          label={t('shell.search.close')}
          className="sm:hidden"
        />
      </form>

      {vm.open && (
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
          {vm.showFilters ? (
            <FilterAndHistoryPane
              serverName={serverName}
              history={search.history}
              t={t}
              onPickFilter={vm.applyFilter}
              onPickHistory={vm.pickHistory}
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
              onPickFilter={vm.applyFilter}
              t={t}
              onJump={vm.jumpTo}
              onClose={vm.closeAll}
              onPreviewUser={vm.previewUser}
            />
          )}
        </div>
      )}
    </div>
  );
}
