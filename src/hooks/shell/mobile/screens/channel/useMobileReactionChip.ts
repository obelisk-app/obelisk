import { findZapPreset } from '@/utils/wallet/zap-presets';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useTranslations } from 'next-intl';
import type { GroupedReaction } from '@/hooks/chat/message/useMessageActions';
import { resolveReactionEmoji } from '@/utils/message-text/emoji-shortcodes';

export function useMobileReactionChip(reaction: GroupedReaction) {
  const t = useTranslations();
  const { zapPresets } = usePreferences();
  const preset = findZapPreset(zapPresets, reaction.emoji);
  return {
    resolved: resolveReactionEmoji(reaction.emoji, reaction.customEmojis),
    title: preset ? t('chat.zap.sendNow', { amount: preset.amountSats })
      : t(reaction.mine ? 'mobile.reactions.removeOwn' : 'mobile.reactions.react'),
  };
}
