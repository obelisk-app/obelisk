'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { useInboxScreen } from '@/hooks/shell/mobile/screens/inbox/useInboxScreen';
import { MentionInboxCard } from './MentionInboxCard';
import { DmInboxCard } from './DmInboxCard';
import { LockedDmsCard } from './LockedDmsCard';
import { BellAltIcon } from '@/assets/icons';

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
            <BellAltIcon size={null} strokeWidth={1.5} />
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
