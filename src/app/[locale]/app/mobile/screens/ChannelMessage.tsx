'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { memo, useRef } from 'react';
import { useUserMetadata, type JsMessage } from '@/services/nostr-bridge';
import MessageContent from '@/components/chat/MessageContent';
import { MentionText } from '@/components/chat/MentionText';
import {
  moderationLabelsFrom,
  useMessageModeration,
  useMessageReactions,
} from '@/hooks/chat/useMessageActions';
import { type CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import { resolveReactionEmoji } from '@/utils/message-text/emoji-shortcodes';
import RoleBadge from '@/components/chat/RoleBadge';
import { useLocale, useTranslations } from 'next-intl';
import { avatarStyle } from '../avatar';
import { timeOfDay } from '@/utils/shell/mobile/labels';
import RemoteImage from '@/components/ui/RemoteImage';

function MobileReplyPreviewRow({
  parent,
  onJump,
}: {
  parent: JsMessage;
  onJump: () => void;
}) {
  const meta = useUserMetadata(parent.pubkey);
  const name = displayNameFor(parent.pubkey, meta);
  const preview = parent.content.replace(/\s+/g, ' ').slice(0, 120);
  return (
    <button
      type="button"
      className="msg-reply-row"
      onClick={(e) => { e.stopPropagation(); onJump(); }}
    >
      <span className="msg-reply-arrow">↩</span>
      <span className="msg-reply-name">{name}</span>
      <span className="msg-reply-text"><MentionText content={preview} /></span>
    </button>
  );
}

/** Stable empty list so a message without reactions keeps the same prop identity. */
export const EMPTY_REACTIONS: never[] = [];

/**
 * One message tile. Memoized: `ChannelScreen` re-renders on every ingest and
 * every `useGroups` tick, and without this each visible tile re-ran
 * react-markdown each time. The caller keeps the props stable (`parent`
 * via `messagesById`, `reactions` via `EMPTY_REACTIONS`, the two callbacks
 * via `useCallback`).
 */
export const ChannelMessage = memo(function ChannelMessage({
  msg,
  parent,
  myPubkey,
  isAdmin,
  groupId,
  reactions,
  onLongPress,
  onAvatar,
}: {
  msg: JsMessage;
  parent?: JsMessage | null;
  myPubkey: string | null;
  isAdmin?: boolean;
  groupId: string;
  reactions: ReadonlyArray<{
    id: string;
    pubkey: string;
    emoji: string;
    customEmojis?: Readonly<Record<string, string>>;
  }>;
  onLongPress: (message: JsMessage) => void;
  onAvatar: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const meta = useUserMetadata(msg.pubkey);
  const name = displayNameFor(msg.pubkey, meta);
  const { grouped, toggle: toggleReaction } = useMessageReactions(msg, groupId, reactions, myPubkey, !!isAdmin);

  // Long-press for the action sheet - a 500ms touch hold
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPress = () => {
    pressTimer.current = setTimeout(() => onLongPress(msg), 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const { retry: onRetry, dismissFailed: onDismissFailed } = useMessageModeration(
    msg, groupId, !!isAdmin, msg.pubkey === myPubkey, moderationLabelsFrom(t),
  );

  const onJumpToParent = () => {
    if (!parent) return;
    const el = document.querySelector(`[data-msg-id="${parent.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-flash');
      setTimeout(() => el.classList.remove('msg-flash'), 1200);
    }
  };

  return (
    <div
      data-msg-id={msg.id}
      className={'msg' + (msg.pending ? ' pending' : '') + (msg.failed ? ' failed' : '')}
    >
      <div className="msg-ava" style={avatarStyle(msg.pubkey)} onClick={() => onAvatar(msg.pubkey)} role="button">
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, msg.pubkey)}
      </div>
      <div className="msg-body">
        {parent && <MobileReplyPreviewRow parent={parent} onJump={onJumpToParent} />}
        {msg.replyToId && !parent && (
          <div className="msg-reply-row msg-reply-row-missing">↩ replying to a message</div>
        )}
        <div className="msg-head">
          <span className="msg-name" onClick={() => onAvatar(msg.pubkey)} role="button">{name}</span>
          <RoleBadge pubkey={msg.pubkey} />
          <span className="msg-time">{timeOfDay(msg.createdAt, locale)}</span>
          {msg.pending && <span className="msg-spinner" aria-label={t('common.sending')} role="status" />}
          <button
            type="button"
            className="msg-more"
            aria-label={t('mobile.message.actions')}
            data-testid="mobile-msg-more"
            onClick={() => onLongPress(msg)}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        </div>
        <div
          className="msg-text"
          onTouchStart={startPress}
          onTouchEnd={cancelPress}
          onTouchMove={cancelPress}
          onTouchCancel={cancelPress}
          onContextMenu={(e) => { e.preventDefault(); onLongPress(msg); }}
        >
          <MessageContent
            content={msg.content}
            messageId={msg.id}
            channelId={groupId}
            customEmojis={msg.customEmojis as CustomEmojiMap | undefined}
            sticker={msg.sticker}
            voiceNote={msg.voiceNote}
            voiceAuthorPicture={meta?.picture}
            voiceTimestamp={msg.createdAt}
          />
        </div>
        {msg.failed && (
          <div className="msg-failed" data-testid="mobile-msg-failed">
            <span className="msg-failed-label">{t('mobile.message.failed')}</span>
            <button
              type="button"
              className="msg-retry"
              onClick={onRetry}
              data-testid="mobile-msg-retry"
            >
              {t('common.retry')}
            </button>
            <button
              type="button"
              className="msg-dismiss"
              onClick={onDismissFailed}
              aria-label={t('mobile.message.dismissFailed')}
            >
              ✕
            </button>
          </div>
        )}
        {grouped.length > 0 && (
          <div className="reactions">
            {grouped.map((r) => {
              const resolved = resolveReactionEmoji(r.emoji, r.customEmojis);
              return (
                <button
                  key={r.emoji}
                  className={`reaction ${r.mine ? 'mine' : ''}`}
                  title={isAdmin ? 'Remove reactions for everyone' : r.mine ? 'Remove your reaction' : 'React'}
                  onClick={() => void toggleReaction(r.emoji, r.customEmojis, r.myReactionId, isAdmin ? r.reactionIds : undefined)}
                >
                  {resolved.kind === 'custom' ? (
                    <RemoteImage src={resolved.url} alt={`:${resolved.name}:`} style={{ width: 16, height: 16, objectFit: 'contain' }} />
                  ) : resolved.char}{' '}
                  {r.count}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

// ───────────────────────────────────────────────────────────────────────────
// 05 - voice room
