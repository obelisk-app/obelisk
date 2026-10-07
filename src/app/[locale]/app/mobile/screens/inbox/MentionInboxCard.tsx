'use client';

import { useTranslations } from 'next-intl';
import { isMentionRead, type MentionNotification } from '@/store/notifications';
import { useMentionCursor } from '@/hooks/notifications/useNotificationSelectors';
import { NotificationCard } from './NotificationCard';

/** A mention or reply on the active relay, faded once read. */
export function MentionInboxCard({ mention, onJump }: { mention: MentionNotification; onJump: () => void }) {
  const t = useTranslations();
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
