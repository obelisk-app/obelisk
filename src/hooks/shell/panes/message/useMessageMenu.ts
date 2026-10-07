'use client';

import type { JsMessage } from '@/services/nostr-bridge';
import type { RecentEmoji } from '@/services/chat/picker/recent-emojis';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import type { MessageRowMenus } from '@/hooks/shell/panes/message/useMessageRowMenus';
import { quickReactionSlots } from '@/utils/shell/panes/message/reaction-pills';

/**
 * The ⋯ menu's view model: its four quick-reaction tiles and the items,
 * each of which acts and then closes the menu (a quick reaction closes
 * every overlay of the row).
 */
export function useMessageMenu({ msg, actions, menus, onReply }: {
  msg: JsMessage;
  actions: MessageRowActions;
  menus: MessageRowMenus;
  onReply: (m: JsMessage) => void;
}) {
  const close = () => menus.setMenuOpen(false);
  return {
    slots: quickReactionSlots(actions.quick4, actions.myReactedEmojis),
    close,
    react: (emoji: RecentEmoji) => { actions.reactWith(emoji); menus.closeAll(); },
    reply: () => { onReply(msg); close(); },
    forward: () => { menus.setForwarding(true); close(); },
    zap: () => { actions.onZapClick(); close(); },
    copyText: () => { actions.copyText(); close(); },
    copyLink: () => { actions.copyLink(); close(); },
    toggleMute: () => { void actions.toggleMute(); close(); },
    deleteMessage: () => { void actions.deleteMessage(); close(); },
  };
}
