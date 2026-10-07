'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import { useCurrentRelayUrl, useMyPubkey, type JsGroup } from '@/services/nostr-bridge';
import { useSearchScreen } from '@/hooks/shell/mobile/screens/search/useSearchScreen';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/forms/Input';
import BackButton from '../../chrome/BackButton';
import { SearchShortIcon } from '@/assets/icons';

/**
 * Phone skin of relay search. The search itself (grammar, debounce, race
 * guard, NIP-11 probe) is `useRelaySearch`, shared with the desktop
 * `SearchBar`; this file owns the mobile chrome.
 *
 * Previously this screen searched joined channel names only while its
 * placeholder and aria-label promised messages and people, and its filter
 * chips were decorative: they set local state no query ever read. They
 * insert real grammar into the input now.
 */
export function SearchScreen({
  back,
  selectGroup,
}: {
  back: () => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
}) {
  const t = useTranslations();
  const relay = useCurrentRelayUrl();
  const myPubkey = useMyPubkey();
  const { search, inputRef, empty, showChannels, nothingAtAll, addToken, openHit, onKeyDown } = useSearchScreen({ back, selectGroup });

  return (
    <div className="screen search-screen active" data-screen="search">
      <div className="search-header">
        <BackButton onClick={back} />
        <div className="search-input-wrap">
          <SearchShortIcon size={null} />
          <Input
            variant="bare"
            ref={inputRef}
            type="search"
            name="obelisk-mobile-search"
            aria-label={t('mobile.search.aria')}
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('mobile.search.placeholder')}
            value={search.raw}
            onChange={(e) => search.setRaw(e.target.value)}
            onKeyDown={onKeyDown}
            autoFocus
          />
          {search.raw && <button className="search-clear" onClick={() => search.setRaw('')}>×</button>}
        </div>
      </div>
      <div className="search-context-pill">in:{shortHost(relay)}</div>
      <div className="search-filter-chips">
        <button className="search-chip" onClick={() => search.setRaw('')} data-testid="mobile-search-chip-all">{t('mobile.search.all')}</button>
        <button className="search-chip" onClick={() => addToken('from:')} data-testid="mobile-search-chip-from">from:</button>
        <button className="search-chip" onClick={() => addToken('in:')} data-testid="mobile-search-chip-in">in:#channel</button>
        {myPubkey && (
          <button className="search-chip" onClick={() => addToken(`mentions:${myPubkey}`)} data-testid="mobile-search-chip-mentions">mentions:@you</button>
        )}
        <button className="search-chip" onClick={() => addToken('has:image')} data-testid="mobile-search-chip-has">has:image</button>
      </div>

      <div className="search-body">
        {search.parsed.unresolved.length > 0 && (
          <div className="search-empty" data-testid="mobile-search-unresolved">
            {search.parsed.unresolved.map((u) => (
              <div key={`${u.key}:${u.value}`}>
                {t('shell.search.unresolved', { token: `${u.key}:${u.value}` })}
              </div>
            ))}
          </div>
        )}
        {!search.relaySearchable && !empty && (
          <div className="search-empty" data-testid="mobile-search-no-nip50">{t('shell.search.noNip50')}</div>
        )}

        {showChannels && <div className="search-section-label">{t('shell.search.channels')}</div>}
        {search.channelMatches.map((g) => (
          <button key={g.id} className="ch-row" onClick={() => selectGroup(g.id, g.kind)}>
            <span className="ch-icon">#</span>
            <span className="ch-name">{g.name ?? g.id.slice(0, 8)}</span>
          </button>
        ))}

        {!empty && (
          <>
            <div className="search-section-label">
              {search.busy
                ? t('shell.search.messagesSearching')
                : t('shell.search.messagesHeader', { count: String(search.results.length) })}
            </div>
            {search.error && <div className="search-empty" data-testid="mobile-search-error">{search.error}</div>}
            {search.results.map((h) => (
              <button
                key={h.id}
                className="ch-row"
                onClick={() => openHit(h)}
                data-testid="mobile-search-message-row"
              >
                <span className="ch-name">{h.content.slice(0, 120)}</span>
              </button>
            ))}
            {!search.busy && !search.error && search.results.length === 0 && (
              <div className="search-empty" data-testid="mobile-search-no-matches">
                {t('shell.search.noMatches')}
              </div>
            )}
            {search.results.length > 0 && search.partial && search.loadMore && (
              <button
                type="button"
                className="ch-row"
                onClick={search.loadMore}
                disabled={search.loadingMore}
                data-testid="mobile-search-load-more"
              >
                <span className="ch-name">{search.loadingMore ? t('shell.search.searching') : t('shell.search.loadMore')}</span>
              </button>
            )}
          </>
        )}

        {nothingAtAll && (
          <div className="search-empty">
            <div className="search-empty-mark">
              <SearchShortIcon size={null} strokeWidth={1.6} />
            </div>
            {t('mobile.search.channelsHelp')}<br />{t('mobile.search.serverSideHelp')}
          </div>
        )}
      </div>
    </div>
  );
}
