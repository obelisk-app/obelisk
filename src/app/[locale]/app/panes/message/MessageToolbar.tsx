'use client';

import type { RefObject } from 'react';
import type { JsMessage } from '@/services/nostr-bridge';
import { ForwardIcon, MoreIcon, ObeliskReactIcon, ReplyIcon } from '@/components/ui/icons/icons';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useMessageToolbar } from '@/hooks/shell/panes/message/useMessageToolbar';

/**
 * One slot of the message hover toolbar: a ghost icon Button at a fixed
 * 32px, white-ish at rest with the menu's green-tinted hover. Each class
 * here sorts after the ghost class it overrides, so it wins.
 */
const TOOLBAR_BTN = 'h-8 w-8 rounded-md text-lc-white/85 hover:bg-lc-green/15';

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
        <Button
          key={e.char}
          variant="ghost"
          size="icon"
          onClick={() => vm.react(e)}
          disabled={mine}
          className={`${TOOLBAR_BTN} text-lg`}
          title={mine ? t('shell.desktop.reactions.alreadyReacted') : t('shell.desktop.reactions.reactEmoji', { emoji: e.char })}
          data-testid="message-quick-reaction"
        >
          {e.url
            ? <RemoteImage src={e.url} alt={e.char} className="h-5 w-5 object-contain" />
            : <span className="leading-none">{e.char}</span>}
        </Button>
      ))}
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePicker}
        className={TOOLBAR_BTN}
        title={t('shell.desktop.reactions.moreEmojis')}
        aria-label={t('shell.desktop.reactions.openEmojiPicker')}
        data-testid="message-add-reaction"
      >
        <ObeliskReactIcon size={22} />
      </Button>
      <span className="mx-0.5 h-5 w-px bg-lc-border" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        onClick={vm.reply}
        className={TOOLBAR_BTN}
        title={t('shell.desktop.message.reply')}
        aria-label={t('shell.desktop.message.reply')}
        data-testid="message-reply"
      >
        <ReplyIcon size={18} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={vm.forward}
        className={TOOLBAR_BTN}
        title={t('chat.message.forward')}
        aria-label={t('chat.message.forward')}
        data-testid="message-forward"
      >
        <ForwardIcon size={18} />
      </Button>
      <Button
        ref={moreBtnRef}
        variant="ghost"
        size="icon"
        onClick={vm.more}
        className={`${TOOLBAR_BTN} ${menuOpen ? 'bg-lc-green/15 text-lc-white' : ''}`}
        title={t('shell.desktop.message.moreActions')}
        aria-label={t('shell.desktop.message.moreActions')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="message-more"
      >
        <MoreIcon size={18} />
      </Button>
    </div>
  );
}
