'use client';

import MobileSigningIndicator from '@/components/feedback/MobileSigningIndicator';
import { useTranslations } from 'next-intl';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { useDmsListScreen } from '@/hooks/shell/mobile/screens/dm/useDmsListScreen';
import { DmUnlock } from '@/components/chat/dm/unlock/DmUnlock';
import { DmRow } from './DmRow';
import { LockWideIcon, PlusIcon, SearchShortIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';

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
        <Heading as="h2">{t('dm.title')}</Heading>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <MobileSigningIndicator />
          <button className="icon-btn action-search" onClick={() => go('compose-dm')} aria-label={t('common.search')}>
            <SearchShortIcon size={20} strokeWidth={1.6} />
          </button>
          <button className="icon-btn action-create" onClick={() => go('compose-dm')} aria-label={t('dm.newMessage')}>
            <PlusIcon size={20} strokeWidth={1.6} />
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
            <LockWideIcon size={null} strokeWidth={1.6} />
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
