import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUserMetadata } from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';
import type { PickedCustomEmoji } from '@/utils/chat/picker/picker-types';
import { moderationLabelsFrom, useMessageModeration } from '@/hooks/chat/message/useMessageActions';
import {
  copyQuietly, emitMobileReaction, MORE_REACTIONS, requestMobileReply,
} from '@/services/shell/mobile/message-actions';

export interface MobileActionMessage {
  id: string;
  pubkey: string;
  content: string;
  groupId?: string;
  canModerate?: boolean;
  canDeleteOwn?: boolean;
}

/**
 * The phone message-actions sheet: who wrote it, the emoji picker toggle,
 * and the actions. Each one that is done closes the sheet; deleting closes
 * it only once the confirmation went through.
 */
export function useMessageActionsSheet(msg: MobileActionMessage, close: () => void) {
  const t = useTranslations();
  const meta = useUserMetadata(msg.pubkey);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { canDelete, deleteMessage: confirmAndDelete } = useMessageModeration(
    msg, msg.groupId, !!msg.canModerate, !!msg.canDeleteOwn, moderationLabelsFrom(t),
  );
  const react = (emoji: string, custom?: PickedCustomEmoji) => {
    emitMobileReaction(msg, emoji, custom);
    close();
  };
  return {
    name: displayNameFor(msg.pubkey, meta),
    pickerOpen,
    closePicker: () => setPickerOpen(false),
    canDelete,
    /** A tap on the quick row: `+` opens the picker, anything else reacts. */
    quickReact: (emoji: string) => {
      if (emoji === MORE_REACTIONS) setPickerOpen(true);
      else react(emoji);
    },
    pickReaction: react,
    reply: () => {
      requestMobileReply(msg.id);
      close();
    },
    copyText: () => {
      copyQuietly(msg.content);
      close();
    },
    copyId: () => {
      copyQuietly(msg.id);
      close();
    },
    deleteMessage: async () => {
      if (await confirmAndDelete()) close();
    },
  };
}
