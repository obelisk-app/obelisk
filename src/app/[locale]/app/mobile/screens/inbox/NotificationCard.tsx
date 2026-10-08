'use client';

import Button from '@/components/ui/buttons/Button';
import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { relativeTime } from '@/utils/format/relative-time';
import { useUserMetadata } from '@/services/nostr-bridge';
import { MentionText } from '@/components/chat/mentions/MentionText';
import { useLocale, useTranslations } from 'next-intl';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** Shared card chrome for both notification streams. */
export function NotificationCard({
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
  const t = useTranslations();
  const locale = useLocale();
  const meta = useUserMetadata(senderPubkey);
  const name = displayNameFor(senderPubkey, meta);
  return (
    <Button
      variant="bare"
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
    </Button>
  );
}
