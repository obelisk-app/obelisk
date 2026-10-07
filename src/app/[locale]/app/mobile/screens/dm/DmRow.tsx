'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { relativeTime } from '@/utils/format/relative-time';
import { type JsDirectMessage } from '@/services/nostr-bridge';
import { useLocale, useTranslations } from 'next-intl';
import { useDMUnreadCount } from '@/hooks/read-state/useUnreadCounts';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';

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
    <button className={`dm-row ${unreadCount > 0 ? 'unread' : ''}`} onClick={onClick}>
      <div className="dm-ava-list" style={avatarStyle(peer)}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, peer)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top">
          <span className="dm-name">{name}</span>
          <span className="dm-time">{relativeTime(latest.createdAt, t, locale)}</span>
        </div>
        <div className="dm-preview">
          <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          {latest.outgoing ? youPrefix : ''}{latest.content}
        </div>
      </div>
      {unreadCount > 0 && <span className="unread-dot" />}
    </button>
  );
}
