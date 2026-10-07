'use client';

import { useTranslations } from 'next-intl';
import { useReadStateStore } from '@/store/read-state';
import { isDmNotificationRead, type DmNotification } from '@/store/notifications';
import { NotificationCard } from './NotificationCard';

/** A direct-message ping, faded once read; no preview while DMs are locked. */
export function DmInboxCard({ dm, onJump }: { dm: DmNotification; onJump: () => void }) {
  const t = useTranslations();
  const cursor = useReadStateStore((s) => s.inboxLastReadAt);
  return (
    <NotificationCard
      senderPubkey={dm.senderPubkey}
      // No preview while DMs are locked: the text is still encrypted.
      preview={dm.preview ?? t('common.ping.newDm')}
      createdAt={dm.createdAt}
      isRead={isDmNotificationRead(dm, cursor)}
      label={t('shell.inbox.type.dm')}
      typeClass="dm"
      icon={
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
      }
      onJump={onJump}
    />
  );
}
