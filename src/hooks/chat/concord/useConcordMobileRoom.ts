import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import type { JsMessage } from '@/services/nostr-bridge';
import { nostrActions, useConfiguredRelays } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useChatStore } from '@/store/chat';
import { useConcordNavigation } from '@/store/chat/concord';
import { buildTimeline } from '@/utils/chat/timeline/channel-timeline';
import { useConcordRoom } from './useConcordRoom';

export function useConcordMobileRoom(community: ConcordCommunity) {
  const room = useConcordRoom(community);
  const t = useTranslations();
  const locale = useLocale();
  const myPubkey = useMyPubkey();
  const relays = useConfiguredRelays();
  const [channelsOpen, setChannelsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [actionMessage, setActionMessage] = useState<JsMessage | null>(null);
  const items = useMemo(() => buildTimeline(room.messages, t, locale), [room.messages, t, locale]);
  return {
    ...room, items, myPubkey, relays, channelsOpen, adding,
    header: { category: room.branding.name, channel: room.group?.name ?? '' },
    showChannels: () => setChannelsOpen(true),
    pickChannel: (id: string) => { room.selectGroup(id); setChannelsOpen(false); },
    selectRelay: (url: string) => { useConcordNavigation.getState().close(); void nostrActions.switchRelay(url); },
    openAdd: () => setAdding(true), closeAdd: () => setAdding(false),
    actionMessage: actionMessage ? { ...actionMessage, groupId: room.group?.id, canDeleteOwn: actionMessage.pubkey === myPubkey } : null,
    openActions: setActionMessage, closeActions: () => setActionMessage(null),
    reply: () => { room.setReplyingTo(actionMessage); setActionMessage(null); },
    openProfile: (pubkey: string) => useChatStore.getState().openProfilePopup(pubkey),
  };
}
