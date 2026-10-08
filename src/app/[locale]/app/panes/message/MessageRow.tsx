'use client';

import { memo } from 'react';
import type { JsMessage } from '@/services/nostr-bridge';
import MessageContent from '@/components/chat/message/MessageContent';
import FloatingPanel from '@/components/ui/overlays/FloatingPanel';
import ForwardMessageModal from '@/components/chat/message/ForwardMessageModal';
import EmojiPicker from '@/components/chat/picker/EmojiPicker';
import { type MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import RoleBadge from '@/components/chat/members/RoleBadge';
import { useTranslations } from 'next-intl';
import { useFormat } from '@/i18n/useFormat';
import { Avatar } from '../../desktop/Avatar';
import { MessageMenu } from './MessageMenu';
import { MessageToolbar } from './MessageToolbar';
import { ReactionPills } from './ReactionPills';
import { ReplyPreviewRow } from './ReplyPreviewRow';
import { flashMessage } from '@/services/chat/timeline/message-flash';
import { useMessageRow } from '@/hooks/shell/panes/message/useMessageRow';
import Button from '@/components/ui/buttons/Button';
import CloseButton from '@/components/ui/buttons/CloseButton';

/**
 * One message. Memoized: `ChatPanel` re-renders on every ingest, profile
 * arrival and member-list update, and without this every visible row
 * re-ran react-markdown each time. The props are kept referentially stable
 * by the caller (`parent` via `messagesById`, `reactions` via
 * `EMPTY_REACTIONS`, `onReply` is a state setter).
 */
export const MessageRow = memo(function MessageRow({
  msg,
  parent,
  reactions,
  zapTotal,
  groupId,
  grouped,
  isAdmin,
  onReply,
}: {
  msg: JsMessage;
  parent: JsMessage | null;
  reactions: ReadonlyArray<{
    id: string;
    emoji: string;
    pubkey: string;
    customEmojis?: Readonly<Record<string, string>>;
  }>;
  zapTotal: MessageZapTotal | null;
  groupId: string;
  grouped: boolean;
  isAdmin: boolean;
  onReply: (m: JsMessage) => void;
}) {
  const { formatDateTime } = useFormat();
  const t = useTranslations();
  const vm = useMessageRow({ msg, groupId, isAdmin, reactions });
  const { meta, menus, actions } = vm;

  return (
    <div data-msg-id={msg.id} className={'group relative flex gap-3 rounded px-2 py-0.5 hover:bg-lc-card/40 ' + (grouped ? 'mt-0' : 'mt-3') + (msg.pending ? ' opacity-60' : '')}>
      <div className="w-10 shrink-0">
        {!grouped && (
          <Button variant="bare" onClick={vm.openProfile} className="rounded-full transition hover:opacity-80">
            <Avatar pubkey={msg.pubkey} size={10} picture={meta?.picture ?? null} />
          </Button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <Button variant="bare" onClick={vm.openProfile} className="text-sm font-bold text-lc-white hover:underline">{vm.displayName}</Button>
            <RoleBadge pubkey={msg.pubkey} />
            <span className="text-[10px] text-lc-muted">
              {formatDateTime(msg.createdAt, {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
              })}
            </span>
            {msg.pending && (
              <span
                className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-lc-muted/40 border-t-lc-muted"
                aria-label={t('common.sending')}
                role="status"
              />
            )}
          </div>
        )}
        {parent && <ReplyPreviewRow parent={parent} onJump={() => flashMessage(parent.id, 1200)} />}
        {msg.replyToId && !parent && (
          <div className="mb-1 text-xs italic text-lc-muted">↩ {t('shell.desktop.message.replyingToMessage')}</div>
        )}
        <div
          className="break-words text-sm text-lc-white cursor-pointer"
          onClick={vm.onBodyClick}
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
          <div className="mt-1 flex items-center gap-2 text-[11px] text-red-400" data-testid="message-failed">
            <span aria-hidden="true">!</span>
            <span>{t('dm.failedSend')}</span>
            <Button variant="outline" tone="danger" size="xs" onClick={actions.retry} data-testid="message-retry">
              {t('common.retry')}
            </Button>
            <CloseButton
              size="sm"
              onClick={actions.dismissFailed}
              label={t('dm.dismissFailed')}
              className="-my-1 text-red-400/70 hover:bg-red-500/10 hover:text-red-300"
            />
          </div>
        )}
        {grouped && msg.pending && (
          <span
            className="ml-2 inline-block h-2.5 w-2.5 animate-spin rounded-full border border-lc-muted/40 border-t-lc-muted align-middle"
            aria-label={t('common.sending')}
            role="status"
          />
        )}
        <ReactionPills actions={actions} zapTotal={zapTotal} isAdmin={isAdmin} />
      </div>
      <div ref={menus.menuRef} className="absolute right-3 -top-3 flex items-start gap-1" data-no-msg-menu>
        <MessageToolbar
          msg={msg}
          actions={actions}
          pinned={vm.toolbarPinned}
          menuOpen={menus.menuOpen}
          moreBtnRef={menus.moreBtnRef}
          closeAll={menus.closeAll}
          togglePicker={menus.togglePicker}
          toggleMenu={menus.toggleMenu}
          onForward={() => menus.setForwarding(true)}
          onReply={onReply}
        />
        {menus.menuOpen && (
          <MessageMenu msg={msg} actions={actions} menus={menus} isAdmin={isAdmin} onReply={onReply} />
        )}
        {menus.pickerOpen && (
          <FloatingPanel anchorRef={menus.menuRef} panelRef={menus.pickerPanelRef} prefer="above" onClose={() => menus.setPickerOpen(false)}>
            <EmojiPicker
              variant="floating"
              disabledEmojis={actions.myReactedEmojis}
              onPick={vm.pickReaction}
              onClose={() => menus.setPickerOpen(false)}
            />
          </FloatingPanel>
        )}
        {menus.forwarding && (
          <ForwardMessageModal
            message={msg}
            authorName={vm.displayName}
            fromGroupId={groupId}
            onClose={() => menus.setForwarding(false)}
          />
        )}
      </div>
    </div>
  );
});
