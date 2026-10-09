'use client';

import { useTranslations } from 'next-intl';
import { useReadStateStore } from '@/store/read-state';
import { isDmNotificationRead, type DmNotification } from '@/store/notifications';
import { NotificationCard } from './NotificationCard';
import { LockIcon } from '@/assets/icons';

/** A direct-message ping, faded once read; no preview while DMs are locked. */
export function DmInboxCard({ dm, onJump }: { dm: DmNotification; onJump: () => void }) {
  const t = useTranslations();
  const peerCursor = useReadStateStore((s) => s.dmCursors[dm.senderPubkey]);
  const cursor = useReadStateStore((s) => s.inboxLastReadAt);
  return (
    <NotificationCard
      senderPubkey={dm.senderPubkey}
      // No preview while DMs are locked: the text is still encrypted.
      preview={dm.preview ?? t('common.ping.newDm')}
      createdAt={dm.createdAt}
      isRead={isDmNotificationRead(dm, cursor, peerCursor)}
      label={t('shell.inbox.type.dm')}
      typeClass="dm"
      icon={
        <LockIcon size={null} strokeWidth={2} />
      }
      onJump={onJump}
    />
  );
}
