'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useComposeDmScreen } from '@/hooks/shell/mobile/screens/dm/useComposeDmScreen';
import Input from '@/components/ui/forms/Input';
import { DmUnlock } from '@/components/chat/dm/unlock/DmUnlock';
import { ComposeUserRow } from './ComposeUserRow';
import { ComposeRecentRow } from './ComposeRecentRow';
import Heading from '@/components/ui/layout/Heading';
import Label from '@/components/ui/forms/Label';

/** The phone new-message screen: a To: field, recent conversations, people search. */
export function ComposeDmScreen({ back, selectPeer }: { back: () => void; selectPeer: (peer: string) => void }) {
  const t = useTranslations();
  const toId = useId();
  const { query, setQuery, recent, results, loading, searching, canNext, next } = useComposeDmScreen(selectPeer);

  return (
    <div className="screen compose-dm-screen active" data-screen="compose-dm">
      <div className="compose-dm-header">
        <button className="compose-dm-cancel" onClick={back}>{t('common.cancel')}</button>
        <Heading as="h2">{t('dm.newMessage')}</Heading>
        <button
          className={`compose-dm-next ${canNext ? 'active' : ''}`}
          disabled={!canNext}
          onClick={next}
        >
          {t('dm.compose.next')}
        </button>
      </div>
      <DmUnlock />
      <div className="compose-dm-to">
        <Label htmlFor={toId} className="compose-dm-to-label">{t('dm.compose.to')}</Label>
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
        {searching ? t('shell.search.users') : t('dm.compose.recent')}
      </div>
      <div className="compose-dm-body">
        {searching && loading && <div className="empty-state-desc">{t('shell.search.searching')}</div>}
        {searching && !loading && results.length === 0 && (
          <div className="empty-state-desc">{t('shell.search.noMatches')}</div>
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
