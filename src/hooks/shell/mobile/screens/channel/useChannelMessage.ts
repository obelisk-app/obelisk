import { useRef, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useUserMetadata, type JsMessage } from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';
import {
  useMessageModeration,
  useMessageReactions,
  type GroupedReaction,
  type MessageReactionInput,
} from '@/hooks/chat/message/useMessageActions';
import { moderationLabelsFrom } from '@/utils/chat/message/moderation-labels';
import { flashMobileMessage } from '@/services/shell/mobile/message-flash';

/** A touch held this long opens the message's action sheet. */
const LONG_PRESS_MS = 500;

/**
 * One phone message tile: its author, the reactions and their toggles, the
 * 500ms long-press (and right-click) for the action sheet, the jump to the
 * quoted message, and retry / dismiss for a failed send.
 */
export function useChannelMessage({
  msg, parent, groupId, reactions, myPubkey, isAdmin, onLongPress,
}: {
  msg: JsMessage;
  parent?: JsMessage | null;
  groupId: string;
  reactions: ReadonlyArray<MessageReactionInput>;
  myPubkey: string | null;
  isAdmin: boolean;
  onLongPress: (message: JsMessage) => void;
}) {
  const t = useTranslations();
  const meta = useUserMetadata(msg.pubkey);
  const { grouped, toggle } = useMessageReactions(msg, groupId, reactions, myPubkey, isAdmin);
  const { retry, dismissFailed } = useMessageModeration(msg, groupId, isAdmin, msg.pubkey === myPubkey, moderationLabelsFrom(t));

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return {
    meta,
    name: displayNameFor(msg.pubkey, meta),
    grouped,
    /** An admin's tap removes the reaction for everyone; anyone else's adds or takes back their own. */
    toggleReaction: (r: GroupedReaction) =>
      void toggle(r.emoji, r.customEmojis, r.myReactionId, isAdmin ? r.reactionIds : undefined),
    startPress: () => {
      pressTimer.current = setTimeout(() => onLongPress(msg), LONG_PRESS_MS);
    },
    cancelPress,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      onLongPress(msg);
    },
    /** The reply quote's tap: scroll to the quoted message, without the tap reaching the tile. */
    jumpToParent: (e: MouseEvent) => {
      e.stopPropagation();
      if (parent) flashMobileMessage(parent.id);
    },
    retry,
    dismissFailed,
  };
}
