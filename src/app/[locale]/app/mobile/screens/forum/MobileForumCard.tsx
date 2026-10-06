'use client';

import { useMemo } from 'react';
import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import {
  useMessages,
  useMessagesStatus,
  useUserMetadata,
  type JsForumTag,
  type JsGroup,
} from '@/services/nostr-bridge';
import { tagChipStyle } from '@/utils/forum-tag-colors';
import { useTranslations } from 'next-intl';
import { avatarStyle } from '../../avatar';
import { resolveTopics } from '@/utils/chat/forum/forum-threads';
import { MobileTagDot } from './MobileTagDot';
import RemoteImage from '@/components/ui/RemoteImage';

/** One publication in the phone forum list: title, opening post, tags, OP and last poster. */
export function MobileForumCard({
  group,
  forumTags,
  onClick,
}: {
  group: JsGroup;
  forumTags: ReadonlyArray<JsForumTag>;
  onClick: () => void;
}) {
  const t = useTranslations();
  const messages = useMessages(group.id);
  // Bridge-owned retry ladder replaces the old UI dwell timer, see
  // src/services/nostr-bridge/types.ts MessagesStatus.
  const messagesStatus = useMessagesStatus(group.id);
  const op = messages[0] ?? null;
  const lastMsg = messages[messages.length - 1] ?? null;
  const opMeta = useUserMetadata(op?.pubkey ?? null);
  const lastMeta = useUserMetadata(lastMsg?.pubkey ?? null);
  const tags = useMemo(() => resolveTopics(group.topics, forumTags), [group.topics, forumTags]);
  // Hide truly-empty threads (matches the desktop forum UX rule).
  if (!op || !lastMsg) {
    if (messagesStatus === 'empty-confirmed') return null;
    // Skeleton-ish: render the card with whatever we have so the user knows
    // the thread exists and is incoming.
    return (
      <button className="forum-card" onClick={onClick} data-testid="mobile-forum-card-skeleton" data-thread-id={group.id}>
        <div className="forum-card-row">
          <div className="dm-ava-list" style={{ ...avatarStyle(group.id), width: 36, height: 36, fontSize: 12 }}>
            {group.picture ? <RemoteImage src={group.picture} alt="" /> : avatarInitials(group.name || group.id.slice(0, 2).toUpperCase(), group.id)}
          </div>
          <div className="forum-card-body">
            <div className="forum-card-title">{group.name ?? group.id.slice(0, 8)}</div>
            <div className="forum-card-preview" style={{ opacity: 0.6 }}>{t('common.loading')}</div>
          </div>
        </div>
      </button>
    );
  }
  const opName = displayNameFor(op.pubkey, opMeta);
  const lastName = displayNameFor(lastMsg.pubkey, lastMeta);
  return (
    <button
      className="forum-card"
      onClick={onClick}
      data-testid="mobile-forum-card"
      data-thread-id={group.id}
    >
      <div className="forum-card-row">
        <div className="dm-ava-list" style={{ ...avatarStyle(group.id), width: 36, height: 36, fontSize: 12 }}>
          {opMeta?.picture ? (
            <RemoteImage src={opMeta.picture} alt="" />
          ) : group.picture ? (
            <RemoteImage src={group.picture} alt="" />
          ) : (
            avatarInitials(group.name || group.id.slice(0, 2).toUpperCase(), group.id)
          )}
        </div>
        <div className="forum-card-body">
          <div className="forum-card-title">{group.name ?? group.id.slice(0, 8)}</div>
          <div className="forum-card-preview">{op.content}</div>
          {tags.length > 0 && (
            <div className="forum-card-tags">
              {tags.map((t) => (
                <span
                  key={t.id}
                  className="forum-card-tag"
                  style={tagChipStyle(t)}
                  data-testid={`mobile-thread-tag-${t.id}`}
                >
                  {t.emoji ? <span>{t.emoji}</span> : <MobileTagDot tag={t} />}
                  <span>{t.name}</span>
                </span>
              ))}
            </div>
          )}
          <div className="forum-card-meta">
            <span><strong>OP</strong> {opName}</span>
            <span>{messages.length} {messages.length === 1 ? 'msg' : 'msgs'}</span>
            <span>last {lastName}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
