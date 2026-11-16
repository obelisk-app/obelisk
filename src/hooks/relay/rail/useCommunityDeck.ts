import { useConcordClient } from '@/hooks/chat/concord/useConcordClient';
import { communityRailEntries } from '@/utils/chat/concord/community-rail';
import { useRelayDeck } from './useRelayDeck';
import { useConcordNavigation } from '@/store/chat/concord';

export function useCommunityDeck(relays: readonly string[], activeRelay: string | null, onSelect: (url: string) => void, onClose: () => void) {
  const concord = useConcordClient();
  const entries = communityRailEntries(relays, concord.railCommunities);
  const active = concord.open ? concord.communityId : activeRelay;
  const deck = useRelayDeck(entries.map(entry => entry.key), active);
  const front = entries[deck.front];
  return {
    ...deck, entries, active,
    relayIndex: front?.kind === 'relay' ? relays.indexOf(front.url) : -1,
    selectRelay: (url: string) => { useConcordNavigation.getState().close(); onSelect(url); },
    selectConcord: (id: string) => { concord.selectCommunity(id, true); onClose(); },
  };
}
