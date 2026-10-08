'use client';

import type { RefObject } from 'react';
import type { JsMessage } from '@/services/nostr-bridge';
import { ForwardIcon, MoreIcon, ObeliskReactIcon, ReplyIcon } from '@/assets/icons';
import { useTranslations } from 'next-intl';
import IconButton from '@/components/ui/buttons/IconButton';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useMessageToolbar } from '@/hooks/shell/panes/message/useMessageToolbar';

/**
 * Hover toolbar, 7 slots: your 3 most recent reactions, the Obelisk
 * face (open the full picker), reply, forward, and ⋯. Hidden while
 * the ⋯ menu is open; pinned while the picker is.
 */
export function MessageToolbar({
  msg, actions, pinned, menuOpen, moreBtnRef, closeAll, togglePicker, toggleMenu, onForward, onReply,
}: {
  msg: JsMessage;
  actions: MessageRowActions;
  /** The ⋯ menu, the pinned panel or the picker is open: keep the bar visible. */
  pinned: boolean;
  menuOpen: boolean;
  moreBtnRef: RefObject<HTMLButtonElement | null>;
  closeAll: () => void;
  togglePicker: () => void;
  toggleMenu: () => void;
  onForward: () => void;
  onReply: (m: JsMessage) => void;
}) {
  const t = useTranslations();
  const vm = useMessageToolbar({ msg, actions, closeAll, toggleMenu, onForward, onReply });
  return (
    <div
      role="toolbar"
      aria-label={t('shell.desktop.message.moreActions')}
      className={
        'items-center gap-0.5 rounded-lg border border-lc-border bg-lc-dark p-0.5 shadow-lg ' +
        (pinned ? 'flex' : 'hidden group-hover:flex')
      }
      data-testid="message-toolbar"
    >
      {vm.slots.map(({ emoji: e, mine }) => (
        <IconButton
          key={e.char}
          tone="ghost"
          size="8"
          shape="square"
          onClick={() => vm.react(e)}
          disabled={mine}
          className="text-lg"
          aria-label={t('shell.desktop.reactions.reactEmoji', { emoji: e.char })}
          title={mine ? t('shell.desktop.reactions.alreadyReacted') : t('shell.desktop.reactions.reactEmoji', { emoji: e.char })}
          data-testid="message-quick-reaction"
        >
          {e.url
            ? <RemoteImage src={e.url} alt={e.char} className="h-5 w-5 object-contain" />
            : <span className="leading-none">{e.char}</span>}
        </IconButton>
      ))}
      <IconButton
        tone="ghost"
        size="8"
        shape="square"
        onClick={togglePicker}
        title={t('shell.desktop.reactions.moreEmojis')}
        aria-label={t('shell.desktop.reactions.openEmojiPicker')}
        data-testid="message-add-reaction"
      >
        <ObeliskReactIcon size={22} />
      </IconButton>
      <span className="mx-0.5 h-5 w-px bg-lc-border" aria-hidden="true" />
      <IconButton
        tone="ghost"
        size="8"
        shape="square"
        onClick={vm.reply}
        title={t('shell.desktop.message.reply')}
        aria-label={t('shell.desktop.message.reply')}
        data-testid="message-reply"
      >
        <ReplyIcon size={18} />
      </IconButton>
      <IconButton
        tone="ghost"
        size="8"
        shape="square"
        onClick={vm.forward}
        title={t('chat.message.forward')}
        aria-label={t('chat.message.forward')}
        data-testid="message-forward"
      >
        <ForwardIcon size={18} />
      </IconButton>
      <IconButton
        ref={moreBtnRef}
        tone="ghost"
        size="8"
        shape="square"
        onClick={vm.more}
        title={t('shell.desktop.message.moreActions')}
        aria-label={t('shell.desktop.message.moreActions')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="message-more"
      >
        <MoreIcon size={18} />
      </IconButton>
    </div>
  );
}
