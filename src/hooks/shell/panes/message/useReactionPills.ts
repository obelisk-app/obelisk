'use client';

import { findZapPreset } from '@/utils/wallet/zap-presets';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import { hasReactionRow, reactionPills, zapPillTotal, type ReactionPill } from '@/utils/shell/panes/message/reaction-pills';

/**
 * The row under a desktop message: the zap pill and one pill per reaction
 * emoji. A click on a pill toggles only the viewer's reaction.
 */
export function useReactionPills(actions: MessageRowActions, zapTotal: MessageZapTotal | null) {
  const { zapPresets } = usePreferences();
  return {
    visible: hasReactionRow(actions.counts, zapTotal),
    zap: zapPillTotal(zapTotal),
    pills: reactionPills(actions.counts.filter((r) => r.emoji.replace(/\uFE0F/g, '') !== '⚡'), actions.myReactedEmojis).map((pill) => ({ ...pill, amountSats: findZapPreset(zapPresets, pill.emoji)?.amountSats })),
    toggle: (p: ReactionPill) => actions.onReactionClick(p.emoji, p.customEmojis, p.myReactionId),
  };
}
