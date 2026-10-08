'use client';

import Text from '@/components/ui/layout/Text';
import type { JsGroup, JsSearchHit } from '@/services/nostr-bridge';
import { isEmptyQuery, type ParsedQuery } from '@/utils/chat/search/search-query';
import { useResultsPane } from '@/hooks/shell/search/useResultsPane';
import Button from '@/components/ui/buttons/Button';
import Chip from '@/components/ui/data/Chip';
import type { Translate } from '@/i18n/keys';
import { ChannelsSection } from './ChannelsSection';
import { SearchResultRow } from './SearchResultRow';
import { UsersSection } from './UsersSection';

/** The dropdown once something is typed: people, channels, then message hits. */
export function ResultsPane({
  raw, parsed, busy, error, results, groups, channelMatches, activeIndex, partial, relayFiltered,
  relaySearchable, thisChannelOnly, canScopeToChannel, onToggleScope, loadingMore,
  onLoadMore, t, onPickFilter, onJump, onClose, onPreviewUser, entityQuery, hasStructuredTokens,
}: {
  raw: string;
  parsed: ParsedQuery;
  busy: boolean;
  error: string | null;
  results: ReadonlyArray<JsSearchHit>;
  groups: ReadonlyArray<JsGroup>;
  channelMatches: ReadonlyArray<JsGroup>;
  entityQuery: string;
  hasStructuredTokens: boolean;
  activeIndex: number;
  partial: boolean;
  relayFiltered: boolean;
  relaySearchable: boolean;
  thisChannelOnly: boolean;
  canScopeToChannel: boolean;
  onToggleScope: () => void;
  loadingMore: boolean;
  onLoadMore: (() => void) | null;
  t: Translate;
  onPickFilter: (token: string) => void;
  onJump: (m: JsSearchHit) => void;
  onClose: () => void;
  onPreviewUser: (pubkey: string) => void;
}) {
  // When the user is composing a structured token query (`from:`, `in:`,
  // `mentions:`, `has:`), they're searching messages, so the people and
  // channel sections hide; otherwise one bar covers all three discovery paths.
  const vm = useResultsPane(raw, hasStructuredTokens, groups);

  return (
    <>
      {vm.showEntities && <UsersSection query={entityQuery} t={t} onPreviewUser={onPreviewUser} />}
      {vm.showEntities && <ChannelsSection matches={channelMatches} t={t} onClose={onClose} />}
      <Text as="div" variant="label" size="11" tone="muted" weight="bold" className="flex items-center gap-2 px-3 py-2 border-b border-lc-border">
        <span data-testid="search-messages-header" aria-live="polite">
          {busy ? t('shell.search.messagesSearching') : t('shell.search.messagesHeader', { count: String(results.length) })}
        </span>
        {canScopeToChannel && (
          <Chip
            size="10"
            state={thisChannelOnly ? 'selected' : 'idle'}
            onClick={onToggleScope}
            className="ml-auto normal-case tracking-normal font-medium"
            data-testid="search-scope-toggle"
          >
            {thisChannelOnly ? t('shell.search.scope.channel') : t('shell.search.scope.relay')}
          </Chip>
        )}
      </Text>

      {parsed.unresolved.length > 0 && (
        <div className="px-3 py-2 text-xs text-amber-300/90" data-testid="search-unresolved">
          {parsed.unresolved.map((u) => (
            <div key={`${u.key}:${u.value}`}>
              {t('shell.search.unresolved', { token: `${u.key}:${u.value}` })}
            </div>
          ))}
        </div>
      )}
      {!relaySearchable && (
        <div className="px-3 py-2 text-xs text-amber-300/90" data-testid="search-no-nip50">
          {t('shell.search.noNip50')}
        </div>
      )}
      {error && <div className="px-3 py-2 text-xs text-red-400">{error}</div>}
      {!busy && results.length === 0 && !error && (
        <Text as="div" variant="caption" className="px-3 py-3 text-center">
          {isEmptyQuery(parsed) ? t('shell.search.messagesPrompt') : t('shell.search.noMatches')}
        </Text>
      )}

      <div role="listbox" aria-label={t('shell.search.messagesHeader', { count: String(results.length) })}>
        {results.map((m, i) => (
          <SearchResultRow
            key={m.id}
            id={`search-result-${i}`}
            active={i === activeIndex}
            msg={m}
            groupName={vm.groupNameFor(m)}
            t={t}
            onJump={() => onJump(m)}
            onAuthor={(pk) => onPickFilter(`from:${pk}`)}
          />
        ))}
      </div>

      {results.length > 0 && partial && onLoadMore && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onLoadMore}
          loading={loadingMore}
          className="w-full"
          data-testid="search-load-more"
        >
          {loadingMore ? t('shell.search.searching') : t('shell.search.loadMore')}
        </Button>
      )}
      {results.length > 0 && !relayFiltered && parsed.terms.length > 0 && (
        <Text as="div" size="10" tone="muted" className="px-3 py-1.5">{t('shell.search.localFilterNote')}</Text>
      )}
    </>
  );
}
