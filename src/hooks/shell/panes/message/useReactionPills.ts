'use client';

import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import { hasReactionRow, reactionPills, zapPillTotal, type ReactionPill } from '@/utils/shell/panes/message/reaction-pills';

/**
 * The row under a desktop message: the zap pill and one pill per reaction
 * emoji. A click on a pill toggles the viewer's reaction, or for an admin
 * removes that emoji's reactions for everyone.
 */
export function useReactionPills(actions: MessageRowActions, zapTotal: MessageZapTotal | null, isAdmin: boolean) {
  return {
    visible: hasReactionRow(actions.counts, zapTotal),
    zap: zapPillTotal(zapTotal),
    pills: reactionPills(actions.counts, actions.myReactedEmojis, isAdmin),
    toggle: (p: ReactionPill) => actions.onReactionClick(p.emoji, p.customEmojis, p.myReactionId, p.removeIds),
  };
}
