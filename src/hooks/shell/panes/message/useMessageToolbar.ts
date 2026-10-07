'use client';

import type { JsMessage } from '@/services/nostr-bridge';
import type { RecentEmoji } from '@/services/chat/picker/recent-emojis';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import { quickReactionSlots } from '@/utils/shell/panes/message/reaction-pills';

/**
 * The hover toolbar's view model: its three recent-reaction slots and the
 * clicks that act and then close the row's overlays.
 */
export function useMessageToolbar({ msg, actions, closeAll, toggleMenu, onForward, onReply }: {
  msg: JsMessage;
  actions: MessageRowActions;
  closeAll: () => void;
  toggleMenu: () => void;
  onForward: () => void;
  onReply: (m: JsMessage) => void;
}) {
  return {
    slots: quickReactionSlots(actions.quick3, actions.myReactedEmojis),
    react: (emoji: RecentEmoji) => { actions.reactWith(emoji); closeAll(); },
    reply: () => { onReply(msg); closeAll(); },
    forward: () => { onForward(); closeAll(); },
    /** Toggle the ⋯ menu without the click reaching the row, which would pin the toolbar. */
    more: (e: { stopPropagation: () => void }) => { e.stopPropagation(); toggleMenu(); },
  };
}
