'use client';

import Button from '@/components/ui/buttons/Button';
import { avatarInitials } from '@/utils/identity/display-name';
import { memo } from 'react';
import { type JsMessage } from '@/services/nostr-bridge';
import MessageContent from '@/components/chat/message/MessageContent';
import { type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import RoleBadge from '@/components/chat/members/RoleBadge';
import { useLocale, useTranslations } from 'next-intl';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import { timeOfDay } from '@/utils/shell/mobile/labels';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useChannelMessage } from '@/hooks/shell/mobile/screens/channel/useChannelMessage';
import { MobileReplyPreviewRow } from './MobileReplyPreviewRow';
import { MobileReactionChip } from './MobileReactionChip';
import { MoreIcon } from '@/assets/icons';

/**
 * One message tile. Memoized: `ChannelScreen` re-renders on every ingest and
 * every `useGroups` tick, and without this each visible tile re-ran
 * react-markdown each time. The caller keeps the props stable (`parent`
 * via `messagesById`, `reactions` via `EMPTY_REACTIONS`, the two callbacks
 * via `useCallback`). State and handlers are `useChannelMessage`.
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
  const vm = useChannelMessage({ msg, parent, groupId, reactions, myPubkey, isAdmin: !!isAdmin, onLongPress });

  return (
    <div
      data-msg-id={msg.id}
      className={'msg' + (msg.pending ? ' pending' : '') + (msg.failed ? ' failed' : '')}
    >
      <div className="msg-ava" style={avatarStyle(msg.pubkey)} onClick={() => onAvatar(msg.pubkey)} role="button">
        {vm.meta?.picture ? <RemoteImage src={vm.meta.picture} alt="" /> : avatarInitials(vm.name, msg.pubkey)}
      </div>
      <div className="msg-body">
        {parent && <MobileReplyPreviewRow parent={parent} onJump={vm.jumpToParent} />}
        {msg.replyToId && !parent && (
          <div className="msg-reply-row msg-reply-row-missing">↩ {t('mobile.channel.replyingToMessage')}</div>
        )}
        <div className="msg-head">
          <span className="msg-name" onClick={() => onAvatar(msg.pubkey)} role="button">{vm.name}</span>
          <RoleBadge pubkey={msg.pubkey} />
          <span className="msg-time">{timeOfDay(msg.createdAt, locale)}</span>
          {msg.pending && <span className="msg-spinner" aria-label={t('common.sending')} role="status" />}
          <Button
            variant="bare"
            type="button"
            className="msg-more"
            aria-label={t('mobile.message.actions')}
            data-testid="mobile-msg-more"
            onClick={() => onLongPress(msg)}
          >
            <MoreIcon size={null} />
          </Button>
        </div>
        <div
          className="msg-text"
          onTouchStart={vm.startPress}
          onTouchEnd={vm.cancelPress}
          onTouchMove={vm.cancelPress}
          onTouchCancel={vm.cancelPress}
          onContextMenu={vm.onContextMenu}
        >
          <MessageContent
            content={msg.content}
            messageId={msg.id}
            channelId={groupId}
            customEmojis={msg.customEmojis as CustomEmojiMap | undefined}
            sticker={msg.sticker}
            voiceNote={msg.voiceNote}
            voiceAuthorPicture={vm.meta?.picture}
            voiceTimestamp={msg.createdAt}
          />
        </div>
        {msg.failed && (
          <div className="msg-failed" data-testid="mobile-msg-failed">
            <span className="msg-failed-label">{t('mobile.message.failed')}</span>
            <Button
              variant="bare"
              type="button"
              className="msg-retry"
              onClick={vm.retry}
              data-testid="mobile-msg-retry"
            >
              {t('common.retry')}
            </Button>
            <Button
              variant="bare"
              type="button"
              className="msg-dismiss"
              onClick={vm.dismissFailed}
              aria-label={t('mobile.message.dismissFailed')}
            >
              ✕
            </Button>
          </div>
        )}
        {vm.grouped.length > 0 && (
          <div className="reactions">
            {vm.grouped.map((r) => (
              <MobileReactionChip key={r.emoji} reaction={r} isAdmin={isAdmin} onToggle={() => vm.toggleReaction(r)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

