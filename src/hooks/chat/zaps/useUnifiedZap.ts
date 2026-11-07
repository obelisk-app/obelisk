import { useMemo } from 'react';
import { topReactors, topZappers } from '@/utils/shell/panes/message/hover-cards';
import { groupReactions } from '@/utils/message-text/emoji-shortcodes';
import { useFormat } from '@/hooks/common/useFormat';
import type { MessageZapTotal } from './useMessageZaps';
import { type MessageReactionInput } from '@/hooks/chat/message/useMessageActions';
import { useMessageAuthor } from '@/hooks/chat/message/useMessageAuthor';
import { useMyPubkey } from '@/hooks/session/useSession';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useQuickZap } from './useQuickZap';
import { displayNameFor } from '@/utils/identity/display-name';
import { nostrActions } from '@/services/nostr-bridge';
import { useToastStore } from '@/store/feedback/toast';
import { useTranslations } from 'next-intl';
import { errorText } from '@/utils/errors/error-text';

export function useUnifiedZap(message: { id: string; pubkey: string }, groupId: string,
  reactions: ReadonlyArray<MessageReactionInput>, isAdmin: boolean, total: MessageZapTotal | null) {
  const myPubkey = useMyPubkey();
  const meta = useMessageAuthor(message.pubkey);
  const grouped = useMemo(() => groupReactions(reactions.filter((r) => !r.zapMarker).map((r) =>
    r.emoji.replace(/\uFE0F/g, '') === '⚡' ? { ...r, emoji: '⚡' } : r), myPubkey, {}), [reactions, myPubkey]);
  const { formatNumber } = useFormat();
  const zappers = useMemo(() => topZappers(total?.zapperAmounts ?? new Map()), [total]);
  const ordinary = grouped.find((r) => r.emoji.replace(/\uFE0F/g, '') === '⚡');
  const reactors = useMemo(() => topReactors(ordinary?.pubkeys ?? new Set()), [ordinary]);
  const { zapPresets } = usePreferences();
  const quickZap = useQuickZap();
  const t = useTranslations();
  return {
    ordinary, formatNumber, zappers: zappers.shown, extraZappers: zappers.extra,
    reactors: reactors.shown, extraReactors: reactors.extra,
    amount: zapPresets[0].amountSats, isOwn: message.pubkey === myPubkey,
    pay: () => void quickZap({ messageId: message.id, recipientPubkey: message.pubkey, groupId,
      displayName: displayNameFor(message.pubkey, meta), recipientLud16: meta?.lud16 }, zapPresets[0].amountSats),
    remove: async () => {
      if (!ordinary) return;
      try {
        if (isAdmin) await Promise.all(ordinary.reactionIds.map((id) => nostrActions.deleteGroupEvent(groupId, id)));
        else if (ordinary.myReactionId) await nostrActions.removeReaction(groupId, ordinary.myReactionId);
      } catch (error) {
        useToastStore.getState().pushToast({ title: errorText(t, error), body: '' });
      }
    },
  };
}
