'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { useInboxScreen } from '@/hooks/shell/mobile/screens/inbox/useInboxScreen';
import { MentionInboxCard } from './MentionInboxCard';
import { DmInboxCard } from './DmInboxCard';
import { LockedDmsCard } from './LockedDmsCard';

/** The phone inbox: mentions on the active relay and DM pings, a tab each. */
export function InboxScreen({
  go,
  selectGroup,
  selectPeer,
}: {
  go: (s: ScreenName) => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
  selectPeer: (peer: string) => void;
}) {
  const t = useTranslations();
  const vm = useInboxScreen(selectGroup);

  return (
    <div className="screen active" data-screen="inbox">
      <div className="app-header">
        <h2>{t('shell.inbox.title')}</h2>
        <button className="mark-all-read" onClick={vm.markAllRead}>{t('shell.inbox.markAllRead')}</button>
      </div>
      <div className="filter-tabs native-scroll-x">
        <button
          className={`filter-tab ${vm.tab === 'mentions' ? 'active' : ''}`}
          data-testid="inbox-tab-mentions"
          onClick={() => vm.setTab('mentions')}
        >
          {t('shell.inbox.tab.mentions')}{vm.unreadMentions > 0 ? ` · ${vm.unreadMentions}` : ''}
        </button>
        <button
          className={`filter-tab ${vm.tab === 'dms' ? 'active' : ''}`}
          data-testid="inbox-tab-dms"
          onClick={() => vm.setTab('dms')}
        >
          {t('shell.inbox.tab.dms')}{vm.unreadDms > 0 ? ` · ${vm.unreadDms}` : ''}
        </button>
      </div>
      <div className="activity-list native-scroll-y">
        {vm.isEmpty && (
          <div className="empty-state" style={{ padding: '40px 24px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
            <div className="empty-state-title">{t('mobile.inbox.caughtUp')}</div>
            <div className="empty-state-desc">
              {vm.tab === 'mentions'
                ? t('mobile.inbox.emptyMentions')
                : t('mobile.inbox.emptyDms')}
            </div>
          </div>
        )}
        {vm.tab === 'mentions'
          ? vm.mentions.map((m) => (
            <MentionInboxCard key={m.id} mention={m} onJump={() => vm.jumpToMention(m)} />
          ))
          : (
            <>
              {vm.lockedDms > 0 && <LockedDmsCard count={vm.lockedDms} onJump={() => go('dms-list')} />}
              {vm.dmNotifications.map((d) => (
                <DmInboxCard key={d.id} dm={d} onJump={() => selectPeer(d.senderPubkey)} />
              ))}
            </>
          )}
      </div>
    </div>
  );
}
