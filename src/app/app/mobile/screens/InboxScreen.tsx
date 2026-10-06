'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { relativeTime } from '@/utils/format/relative-time';
import { useState } from 'react';
import {
  useGroups,
  useUserMetadata,
  useCurrentRelayUrl,
  getBridgeImpl,
  type JsGroup,
} from '@/services/nostr-bridge';
import { MentionText } from '@/components/chat/MentionText';
import { useTranslation } from '@/i18n/context';
import { useReadStateStore } from '@/store/read-state';
import {
  isDmNotificationRead,
  isMentionRead,
  useNotificationsStore,
  type DmNotification,
  type MentionNotification,
} from '@/store/notifications';
import {
  useDmNotifications,
  useMentionCursor,
  useMentionNotifications,
  useUnreadDmNotificationCount,
  useUnreadMentionCount,
} from '@/hooks/notifications/useNotificationSelectors';
import { type ScreenName } from '../url-state';
import { avatarStyle } from '../avatar';
import RemoteImage from '@/components/ui/RemoteImage';

type InboxFilter = 'mentions' | 'dms';

export function InboxScreen({
  selectGroup,
  selectPeer,
}: {
  go: (s: ScreenName) => void;
  selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
  selectPeer: (peer: string) => void;
}) {
  const { t } = useTranslation();
  const relay = useCurrentRelayUrl();
  const mentions = useMentionNotifications(relay);
  const dmNotifications = useDmNotifications();
  const unreadMentions = useUnreadMentionCount(relay);
  const unreadDms = useUnreadDmNotificationCount();
  const markMentionsRead = useNotificationsStore((s) => s.markMentionsRead);
  const markAllAsRead = useReadStateStore((s) => s.markAllAsRead);
  const groups = useGroups();

  const [tab, setTab] = useState<InboxFilter>('mentions');

  // "Mark all read" acts on the visible stream only - clearing mentions
  // must not silence unread DMs. Bridge stores are read imperatively at
  // click time so this screen doesn't re-render on every message arrival.
  const handleMarkAll = () => {
    const impl = getBridgeImpl();
    if (tab === 'mentions') {
      if (relay) markMentionsRead(relay);
      markAllAsRead([], impl ? Object.keys(impl.messagesByGroup.get()) : []);
    } else {
      markAllAsRead(impl ? Object.keys(impl.dmsByPeer.get()) : [], []);
    }
  };

  const handleMentionJump = (m: MentionNotification) => {
    const g = groups.find((x) => x.id === m.channelId);
    selectGroup(m.channelId, g?.kind ?? 'text');
  };

  const isEmpty = tab === 'mentions' ? mentions.length === 0 : dmNotifications.length === 0;

  return (
    <div className="screen active" data-screen="inbox">
      <div className="app-header">
        <h2>{t('inbox.title')}</h2>
        <button className="mark-all-read" onClick={handleMarkAll}>{t('inbox.markAllRead')}</button>
      </div>
      <div className="filter-tabs native-scroll-x">
        <button
          className={`filter-tab ${tab === 'mentions' ? 'active' : ''}`}
          data-testid="inbox-tab-mentions"
          onClick={() => setTab('mentions')}
        >
          {t('inbox.tab.mentions')}{unreadMentions > 0 ? ` · ${unreadMentions}` : ''}
        </button>
        <button
          className={`filter-tab ${tab === 'dms' ? 'active' : ''}`}
          data-testid="inbox-tab-dms"
          onClick={() => setTab('dms')}
        >
          {t('inbox.tab.dms')}{unreadDms > 0 ? ` · ${unreadDms}` : ''}
        </button>
      </div>
      <div className="activity-list native-scroll-y">
        {isEmpty && (
          <div className="empty-state" style={{ padding: '40px 24px' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>
            <div className="empty-state-title">{t('mobile.inbox.caughtUp')}</div>
            <div className="empty-state-desc">
              {tab === 'mentions'
                ? t('mobile.inbox.emptyMentions')
                : t('mobile.inbox.emptyDms')}
            </div>
          </div>
        )}
        {tab === 'mentions'
          ? mentions.map((m) => (
            <MentionInboxCard key={m.id} mention={m} onJump={() => handleMentionJump(m)} />
          ))
          : dmNotifications.map((d) => (
            <DmInboxCard key={d.id} dm={d} onJump={() => selectPeer(d.senderPubkey)} />
          ))}
      </div>
    </div>
  );
}

/** Shared card chrome for both notification streams. */
function NotificationCard({
  senderPubkey,
  preview,
  createdAt,
  isRead,
  urgent,
  label,
  icon,
  typeClass,
  onJump,
}: {
  senderPubkey: string;
  preview: string;
  createdAt: number;
  isRead: boolean;
  urgent?: boolean;
  label: string;
  icon?: React.ReactNode;
  typeClass: string;
  onJump: () => void;
}) {
  const { t, locale } = useTranslation();
  const meta = useUserMetadata(senderPubkey);
  const name = displayNameFor(senderPubkey, meta);
  return (
    <button
      className={`mention-card ${urgent ? 'urgent' : ''}`}
      style={isRead ? { opacity: 0.65 } : undefined}
      onClick={onJump}
    >
      <div className="mc-context">
        <span className={`notif-type ${typeClass}`}>
          {icon}
          {label}
        </span>
        <span className="mc-time">{relativeTime(Math.floor(createdAt / 1000), t, locale)}</span>
      </div>
      <div className="mc-msg" style={{ marginTop: 6 }}>
        <div className="mc-ava" style={avatarStyle(senderPubkey)}>
          {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, senderPubkey)}
        </div>
        <div className="mc-body">
          <div className="mc-name" style={{ color: 'var(--app-text)' }}>{name}</div>
          <div className="mc-text" style={{ color: 'var(--app-text-dim)' }}><MentionText content={preview} /></div>
        </div>
      </div>
    </button>
  );
}

function MentionInboxCard({ mention, onJump }: { mention: MentionNotification; onJump: () => void }) {
  const { t } = useTranslation();
  const cursor = useMentionCursor(mention.relay);
  return (
    <NotificationCard
      senderPubkey={mention.senderPubkey}
      preview={mention.preview}
      createdAt={mention.createdAt}
      isRead={isMentionRead(mention, cursor)}
      urgent
      label={t(mention.reason === 'reply' ? 'mobile.inbox.type.reply' : 'mobile.inbox.type.mention')}
      typeClass="mention"
      onJump={onJump}
    />
  );
}

function DmInboxCard({ dm, onJump }: { dm: DmNotification; onJump: () => void }) {
  const { t } = useTranslation();
  const cursor = useReadStateStore((s) => s.inboxLastReadAt);
  return (
    <NotificationCard
      senderPubkey={dm.senderPubkey}
      preview={dm.preview}
      createdAt={dm.createdAt}
      isRead={isDmNotificationRead(dm, cursor)}
      label={t('inbox.type.dm')}
      typeClass="dm"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
      }
      onJump={onJump}
    />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 09 - profile view
