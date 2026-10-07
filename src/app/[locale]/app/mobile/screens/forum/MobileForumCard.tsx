'use client';

import { avatarInitials } from '@/utils/identity/display-name';
import { type JsForumTag, type JsGroup } from '@/services/nostr-bridge';
import { useMobileForumCard } from '@/hooks/shell/mobile/screens/forum/useMobileForumCard';
import { tagChipStyle } from '@/utils/chat/forum/forum-tag-colors';
import { useTranslations } from 'next-intl';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import { MobileTagDot } from './MobileTagDot';
import RemoteImage from '@/components/ui/media/RemoteImage';

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
  const card = useMobileForumCard(group, forumTags);
  // Hide truly-empty threads (matches the desktop forum UX rule).
  if (card.state === 'hidden') return null;
  if (card.state === 'loading' || !card.op) {
    // Skeleton-ish: render the card with whatever we have so the user knows
    // the thread exists and is incoming.
    return (
      <button className="forum-card" onClick={onClick} data-testid="mobile-forum-card-skeleton" data-thread-id={group.id}>
        <div className="forum-card-row">
          <div className="dm-ava-list" style={{ ...avatarStyle(group.id), width: 36, height: 36, fontSize: 12 }}>
            {group.picture ? <RemoteImage src={group.picture} alt="" /> : avatarInitials(card.initialsSeed, group.id)}
          </div>
          <div className="forum-card-body">
            <div className="forum-card-title">{card.title}</div>
            <div className="forum-card-preview" style={{ opacity: 0.6 }}>{t('common.loading')}</div>
          </div>
        </div>
      </button>
    );
  }
  return (
    <button
      className="forum-card"
      onClick={onClick}
      data-testid="mobile-forum-card"
      data-thread-id={group.id}
    >
      <div className="forum-card-row">
        <div className="dm-ava-list" style={{ ...avatarStyle(group.id), width: 36, height: 36, fontSize: 12 }}>
          {card.opMeta?.picture ? (
            <RemoteImage src={card.opMeta.picture} alt="" />
          ) : group.picture ? (
            <RemoteImage src={group.picture} alt="" />
          ) : (
            avatarInitials(card.initialsSeed, group.id)
          )}
        </div>
        <div className="forum-card-body">
          <div className="forum-card-title">{card.title}</div>
          <div className="forum-card-preview">{card.op.content}</div>
          {card.tags.length > 0 && (
            <div className="forum-card-tags">
              {card.tags.map((t) => (
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
            <span><strong>{t('mobile.forum.op')}</strong> {card.opName}</span>
            <span>{t('mobile.forum.messages', { count: card.messageCount })}</span>
            <span>{t('mobile.forum.lastBy', { name: card.lastName })}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
