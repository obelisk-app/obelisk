'use client';

import { useEffect, useMemo } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import { useUserMetadata as useProfile, type JsGroup, type JsSearchHit } from '@/services/nostr-bridge';
import { useNostrUserSearch, type UserHit } from '@/hooks/useNostrUserSearch';
import { isEmptyQuery, type ParsedQuery } from '@/utils/search-query';
import { recordNip05Resolution } from '@/services/nip05-verify';
import { useNip05Status } from '@/hooks/useNip05Status';
import { CheckBadgeIcon } from '@/components/ui/icons';
import { formatPubkey } from '@nostr-wot/data';
import { useChatStore } from '@/store/chat';
import { useFormat } from '@/i18n/useFormat';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import RemoteImage from '@/components/ui/RemoteImage';
import type { Translate } from '@/i18n/keys';

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
  // `mentions:`, `has:`), they're searching messages - hide the entity
  // sections to avoid noise. Otherwise show Users + Channels alongside
  // Messages so a single bar covers all three discovery paths.
  const showEntities = !hasStructuredTokens && raw.trim().length >= 1;

  // One lookup for the whole pane. This used to be a `useGroups()` call
  // inside every result row.
  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) if (g.name) m.set(g.id, g.name);
    return m;
  }, [groups]);

  return (
    <>
      {showEntities && <UsersSection query={entityQuery} t={t} onPreviewUser={onPreviewUser} />}
      {showEntities && <ChannelsSection matches={channelMatches} t={t} onClose={onClose} />}
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
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
      </div>

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
        <div className="px-3 py-3 text-center text-xs text-lc-muted">
          {isEmptyQuery(parsed) ? t('shell.search.messagesPrompt') : t('shell.search.noMatches')}
        </div>
      )}

      <div role="listbox" aria-label={t('shell.search.messagesHeader', { count: String(results.length) })}>
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
        <div className="px-3 py-1.5 text-[10px] text-lc-muted">{t('shell.search.localFilterNote')}</div>
      )}
    </>
  );
}

function UsersSection({ query, t, onPreviewUser }: { query: string; t: Translate; onPreviewUser: (pubkey: string) => void }) {
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(query);

  // The reader typed this handle and the `.well-known` lookup resolved it to
  // this pubkey: that is a verification, so remember it for the row.
  useEffect(() => {
    if (nip05Hit?.nip05) recordNip05Resolution(nip05Hit.pubkey, nip05Hit.nip05);
  }, [nip05Hit]);

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
        <span>{t('shell.search.users')}</span>
        {loading && <span className="text-[10px] normal-case font-normal text-lc-muted">{t('shell.search.searching')}</span>}
      </div>
      {rows.length === 0 && !loading && (
        <div className="px-3 py-2 text-xs text-lc-muted">{t('shell.search.noMatches')}</div>
      )}
      {rows.map((r) => (
        <UserResultRow key={r.key} hit={r.hit} badge={r.badge} onPick={() => onPreviewUser(r.hit.pubkey)} />
      ))}
    </section>
  );
}

function UserResultRow({ hit, badge, onPick }: { hit: UserHit; badge?: string; onPick: () => void }) {
  const name = hit.displayName ?? formatPubkey(hit.pubkey);
  // `peek`: a search result list must not make the reader's browser call a
  // domain each profile author chose. The handle stays a muted claim unless
  // a lookup the reader initiated (the NIP-05 row, an opened popover)
  // already confirmed it.
  const nip05State = useNip05Status(hit.pubkey, hit.nip05, 'peek');
  const verified = nip05State === 'verified';
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-lc-card border-b border-lc-border/40 last:border-b-0"
      data-testid="search-user-row"
      data-pubkey={hit.pubkey}
    >
      {hit.picture ? (
        <RemoteImage src={hit.picture} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
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
        <div
          className={`flex items-center gap-1 text-[11px] ${verified ? 'text-lc-green' : 'text-lc-muted'}`}
          data-testid="search-user-sub"
          data-nip05-state={hit.nip05 ? nip05State : undefined}
        >
          {verified && <CheckBadgeIcon size={11} />}
          <span className="truncate">{hit.nip05 ?? formatPubkey(hit.pubkey)}</span>
        </div>
      </div>
    </button>
  );
}

function ChannelsSection({ matches, t, onClose }: { matches: ReadonlyArray<JsGroup>; t: Translate; onClose: () => void }) {
  if (matches.length === 0) return null;

  const pick = (g: JsGroup) => {
    // The bridge's active-group call only moves the relay subscription; the
    // shell decides what's rendered, so calling it from here left the user
    // staring at the channel they were already in. Go through the shell.
    useChatStore.getState().requestJump(g.id);
    onClose();
  };

  return (
    <section data-testid="search-channels-section">
      <div className="flex items-center px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
        <span>{t('shell.search.channels')}</span>
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
            <RemoteImage src={g.picture} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
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
  t: Translate;
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
        <span className="text-lc-muted">{t('shell.search.in')}</span>
        <span className="text-lc-green truncate">#{channel}</span>
        <span className="ml-auto text-[10px] text-lc-muted">
          {formatDateTime(msg.createdAt)}
        </span>
      </div>
      <button onClick={onJump} className="mt-0.5 block w-full text-left text-sm text-lc-white/90 line-clamp-2">{msg.content}</button>
    </div>
  );
}
