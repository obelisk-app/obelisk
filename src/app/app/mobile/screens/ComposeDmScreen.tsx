'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/services/social/useAuthor';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useId, useMemo, useState } from 'react';
import { useDirectMessages } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import { npubToHex } from '@nostr-wot/data';
import { useNostrUserSearch, type UserHit } from '@/hooks/useNostrUserSearch';
import { avatarStyle } from '../avatar';
import Input from '@/components/ui/Input';
import RemoteImage from '@/components/ui/RemoteImage';

export function ComposeDmScreen({ back, selectPeer }: { back: () => void; selectPeer: (peer: string) => void }) {
  const { t } = useTranslation();
  const toId = useId();
  const [query, setQuery] = useState('');
  const dms = useDirectMessages();
  const { directHit, nip05Hit, nostrResults, loading } = useNostrUserSearch(query);
  const recent = useMemo(() => Object.keys(dms).slice(0, 20), [dms]);
  const results = useMemo(() => {
    const seen = new Set<string>();
    return [directHit, nip05Hit, ...nostrResults].filter((hit): hit is UserHit =>
      !!hit && !seen.has(hit.pubkey) && !!seen.add(hit.pubkey),
    );
  }, [directHit, nip05Hit, nostrResults]);
  const decoded = npubToHex(query);
  const searching = query.trim().length >= 2;

  return (
    <div className="screen compose-dm-screen active" data-screen="compose-dm">
      <div className="compose-dm-header">
        <button className="compose-dm-cancel" onClick={back}>{t('common.cancel')}</button>
        <h2>{t('dm.newMessage')}</h2>
        <button
          className={`compose-dm-next ${decoded ? 'active' : ''}`}
          disabled={!decoded}
          onClick={() => decoded && selectPeer(decoded)}
        >
          {t('dm.compose.next')}
        </button>
      </div>
      <div className="compose-dm-to">
        <label htmlFor={toId} className="compose-dm-to-label">{t('dm.compose.to')}</label>
        <Input
          variant="bare"
          id={toId}
          className="compose-dm-to-input"
          placeholder={t('dm.compose.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="search-section-label">
        {searching ? t('search.users') : t('dm.compose.recent')}
      </div>
      <div className="compose-dm-body">
        {searching && loading && <div className="empty-state-desc">{t('search.searching')}</div>}
        {searching && !loading && results.length === 0 && (
          <div className="empty-state-desc">{t('search.noMatches')}</div>
        )}
        {searching && results.map((hit) => (
          <ComposeUserRow key={hit.pubkey} hit={hit} onClick={() => selectPeer(hit.pubkey)} />
        ))}
        {!searching && recent.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-title">{t('dm.compose.noRecent')}</div>
            <div className="empty-state-desc">{t('dm.compose.noRecentDescription')}</div>
          </div>
        )}
        {!searching && recent.map((p) => <ComposeRecentRow key={p} peer={p} onClick={() => selectPeer(p)} />)}
      </div>
    </div>
  );
}

function ComposeUserRow({ hit, onClick }: { hit: UserHit; onClick: () => void }) {
  const name = hit.displayName || displayNameFor(hit.pubkey);
  return (
    <button className="dm-row" onClick={onClick} data-testid="mobile-user-search-result">
      <div className="dm-ava-list" style={avatarStyle(hit.pubkey)}>
        {hit.picture ? <RemoteImage src={hit.picture} alt="" /> : avatarInitials(name, hit.pubkey)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top"><span className="dm-name">{name}</span></div>
        <div className="dm-preview">{hit.nip05 ?? shortNpubLabel(hit.pubkey)}</div>
      </div>
    </button>
  );
}

function ComposeRecentRow({ peer, onClick }: { peer: string; onClick: () => void }) {
  const meta = useAuthor(peer);
  const name = displayNameFor(peer, meta);
  return (
    <button className="dm-row" onClick={onClick}>
      <div className="dm-ava-list" style={avatarStyle(peer)}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, peer)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top">
          <span className="dm-name">{name}</span>
        </div>
        <div className="dm-preview">{meta?.nip05 ?? shortNpubLabel(peer)}</div>
      </div>
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 12 - search
