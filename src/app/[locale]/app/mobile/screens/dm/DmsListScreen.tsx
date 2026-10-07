'use client';

import MobileSigningIndicator from '@/components/feedback/MobileSigningIndicator';
import { useTranslations } from 'next-intl';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { useDmsListScreen } from '@/hooks/shell/mobile/screens/dm/useDmsListScreen';
import { DmUnlock } from '@/components/chat/dm/unlock/DmUnlock';
import { DmRow } from './DmRow';

/** The phone DMs tab: conversations with people you follow, and with everyone else. */
export function DmsListScreen({
  go,
  selectPeer,
  myFollows,
}: {
  go: (s: ScreenName) => void;
  selectPeer: (peer: string) => void;
  myFollows: ReadonlyArray<string>;
}) {
  const t = useTranslations();
  const { tab, setTab, shown, followsCount, othersCount, listRef } = useDmsListScreen(myFollows);

  return (
    <div className="screen active" data-screen="dms-list">
      <div className="app-header">
        <h2>{t('dm.title')}</h2>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <MobileSigningIndicator />
          <button className="icon-btn action-search" onClick={() => go('compose-dm')} aria-label={t('common.search')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          <button className="icon-btn action-create" onClick={() => go('compose-dm')} aria-label={t('dm.newMessage')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </div>
      <DmUnlock />

      <div className="dms-tabs native-scroll-x">
        <button className={`filter-tab ${tab === 'follows' ? 'active' : ''}`} onClick={() => setTab('follows')}>
          {t('dm.follows')} · {followsCount}
        </button>
        <button className={`filter-tab ${tab === 'others' ? 'active' : ''}`} onClick={() => setTab('others')}>
          {t('dm.others')} · {othersCount}
        </button>
      </div>

      <div className="dms-list-rows native-scroll-y" ref={listRef}>
        {shown.length === 0 && (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <div className="empty-state-title">{t('dm.noConversations')}</div>
            <div className="empty-state-desc">{t('dm.emptyMobileDescription')}</div>
          </div>
        )}
        {shown.map((p) => (
          <DmRow key={p.peer} peer={p.peer} latest={p.latest} youPrefix={t('dm.youPrefix')} onClick={() => selectPeer(p.peer)} />
        ))}
      </div>
    </div>
  );
}
