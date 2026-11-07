import { useToastStore } from '@/store/feedback/toast';
import { findZapPreset } from '@/utils/wallet/zap-presets';
import { useQuickZap } from '@/hooks/chat/zaps/useQuickZap';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { QUICK_REACTIONS } from '@/constants/shell/mobile';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUserMetadata } from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';
import type { PickedCustomEmoji } from '@/types/chat/picker';
import { useMessageModeration } from '@/hooks/chat/message/useMessageActions';
import { moderationLabelsFrom } from '@/utils/chat/message/moderation-labels';
import {
  copyQuietly,
  emitMobileReaction,
  requestMobileReply,
} from '@/services/shell/mobile/message-actions';
import { MORE_REACTIONS } from '@/constants/shell/mobile';

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
  const quickZap = useQuickZap();
  const { zapPresets } = usePreferences();
  const meta = useUserMetadata(msg.pubkey);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { canDelete, deleteMessage: confirmAndDelete } = useMessageModeration(
    msg, msg.groupId, !!msg.canModerate, !!msg.canDeleteOwn, moderationLabelsFrom(t),
  );
  const react = (emoji: string, custom?: PickedCustomEmoji) => {
    const preset = findZapPreset(zapPresets, emoji);
    if (preset) {
      if (!msg.groupId) {
        useToastStore.getState().pushToast({ title: t('chat.zapCommand.noTarget'), body: '' });
        close();
        return;
      }
      void quickZap({ messageId: msg.id, recipientPubkey: msg.pubkey, groupId: msg.groupId,
        recipientLud16: meta?.lud16, displayName: displayNameFor(msg.pubkey, meta) }, preset.amountSats);
    } else emitMobileReaction(msg, emoji, custom);
    close();
  };
  return {
    quickReactions: [...new Set([...zapPresets.map((p) => p.emoji), ...QUICK_REACTIONS])],
    reactionAmount: (emoji: string) => findZapPreset(zapPresets, emoji)?.amountSats,
    reactionTitle: (emoji: string) => {
      const preset = findZapPreset(zapPresets, emoji);
      return preset ? t('chat.zap.sendNow', { amount: String(preset.amountSats) }) : emoji;
    },
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
