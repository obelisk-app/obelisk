'use client';

import type { RefObject } from 'react';
import type { JsMessage } from '@/services/nostr-bridge';
import { ForwardIcon, MoreIcon, ObeliskReactIcon, ReplyIcon } from '@/components/ui/icons';
import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import type { MessageRowActions } from '@/hooks/app/panes/message/useMessageRowActions';
import RemoteImage from '@/components/ui/RemoteImage';

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
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t('desktop.message.moreActions')}
      className={
        'items-center gap-0.5 rounded-lg border border-lc-border bg-lc-dark p-0.5 shadow-lg ' +
        (pinned ? 'flex' : 'hidden group-hover:flex')
      }
      data-testid="message-toolbar"
    >
      {actions.quick3.map((e) => {
        const mine = actions.myReactedEmojis.has(e.char);
        return (
          <Button
            key={e.char}
            variant="ghost"
            size="icon"
            onClick={() => { actions.reactWith(e); closeAll(); }}
            disabled={mine}
            className={`${TOOLBAR_BTN} text-lg`}
            title={mine ? t('desktop.reactions.alreadyReacted') : t('desktop.reactions.reactEmoji').replace('{emoji}', e.char)}
            data-testid="message-quick-reaction"
          >
            {e.url
              ? <RemoteImage src={e.url} alt={e.char} className="h-5 w-5 object-contain" />
              : <span className="leading-none">{e.char}</span>}
          </Button>
        );
      })}
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePicker}
        className={TOOLBAR_BTN}
        title={t('desktop.reactions.moreEmojis')}
        aria-label={t('desktop.reactions.openEmojiPicker')}
        data-testid="message-add-reaction"
      >
        <ObeliskReactIcon size={22} />
      </Button>
      <span className="mx-0.5 h-5 w-px bg-lc-border" aria-hidden="true" />
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { onReply(msg); closeAll(); }}
        className={TOOLBAR_BTN}
        title={t('desktop.message.reply')}
        aria-label={t('desktop.message.reply')}
        data-testid="message-reply"
      >
        <ReplyIcon size={18} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { onForward(); closeAll(); }}
        className={TOOLBAR_BTN}
        title={t('message.forward')}
        aria-label={t('message.forward')}
        data-testid="message-forward"
      >
        <ForwardIcon size={18} />
      </Button>
      <Button
        ref={moreBtnRef}
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu();
        }}
        className={`${TOOLBAR_BTN} ${menuOpen ? 'bg-lc-green/15 text-lc-white' : ''}`}
        title={t('desktop.message.moreActions')}
        aria-label={t('desktop.message.moreActions')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-testid="message-more"
      >
        <MoreIcon size={18} />
      </Button>
    </div>
  );
}
