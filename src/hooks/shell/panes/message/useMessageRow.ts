'use client';

import type { MouseEvent } from 'react';
import { useUserMetadata as useProfile, type JsMessage } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { displayNameFor } from '@/utils/identity/display-name';
import type { MessageReactionInput } from '@/hooks/chat/message/useMessageActions';
import { useMessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import { useMessageRowMenus } from '@/hooks/shell/panes/message/useMessageRowMenus';
import { isInteractiveClick, pickedEmojiTags } from '@/utils/shell/panes/message/message-row';

/**
 * One desktop message row's view model: the author, the row's overlays
 * (`useMessageRowMenus`), what it can do to the message
 * (`useMessageRowActions`), and the three clicks the row itself handles.
 */
export function useMessageRow({ msg, groupId, isAdmin, reactions }: {
  msg: JsMessage;
  groupId: string;
  isAdmin: boolean;
  reactions: ReadonlyArray<MessageReactionInput>;
}) {
  const meta = useProfile(msg.pubkey);
  const menus = useMessageRowMenus();
  const actions = useMessageRowActions({ msg, groupId, isAdmin, reactions, meta });
  return {
    meta,
    menus,
    actions,
    displayName: displayNameFor(msg.pubkey, meta),
    /** The toolbar stays visible while the menu, the pinned panel or the picker is open. */
    toolbarPinned: menus.menuOpen || menus.panelPinned || menus.pickerOpen,
    openProfile: (event: MouseEvent<HTMLElement>) =>
      useChatStore.getState().openProfilePopup(msg.pubkey, { x: event.clientX, y: event.clientY }),
    /** A click on the body pins the toolbar, unless it landed on a link or control inside the message. */
    onBodyClick: (event: MouseEvent<HTMLElement>) => {
      if (isInteractiveClick(event.target as HTMLElement)) return;
      menus.togglePinned();
    },
    /** A reaction picked from the full picker; then every overlay closes. */
    pickReaction: (emoji: string, custom?: { name: string; url: string }) => {
      actions.onReactionClick(emoji, pickedEmojiTags(custom));
      menus.closeAll();
    },
  };
}
