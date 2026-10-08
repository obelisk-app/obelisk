'use client';

import Button from '@/components/ui/buttons/Button';
import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { relativeTime } from '@/utils/format/relative-time';
import { type JsDirectMessage } from '@/services/nostr-bridge';
import { useLocale, useTranslations } from 'next-intl';
import { useDMUnreadCount } from '@/hooks/read-state/useUnreadCounts';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { LockIcon } from '@/assets/icons';

/** One conversation in the phone DM list: avatar, name, when, the latest message and an unread dot. */
export function DmRow({
  peer,
  latest,
  youPrefix,
  onClick,
}: {
  peer: string;
  latest: JsDirectMessage;
  youPrefix: string;
  onClick: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  // `useAuthor` merges the bridge (group tier) with the social resolver -
  // the bridge alone only knows people from your NIP-29 rooms, which is why
  // DM rows showed npubs and letter avatars while the feed showed faces.
  const meta = useAuthor(peer);
  const unreadCount = useDMUnreadCount(peer);
  const name = displayNameFor(peer, meta);
  return (
    <Button variant="bare" className={`dm-row ${unreadCount > 0 ? 'unread' : ''}`} onClick={onClick}>
      <div className="dm-ava-list" style={avatarStyle(peer)}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, peer)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top">
          <span className="dm-name">{name}</span>
          <span className="dm-time">{relativeTime(latest.createdAt, t, locale)}</span>
        </div>
        <div className="dm-preview">
          <LockIcon size={null} strokeWidth={2} className="lock" />
          {latest.outgoing ? youPrefix : ''}{latest.content}
        </div>
      </div>
      {unreadCount > 0 && <span className="unread-dot" />}
    </Button>
  );
}
