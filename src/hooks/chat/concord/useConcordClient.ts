import { useContext } from 'react';
import { ConcordContext } from '@/contexts/chat/concord';
import { useConcordNavigation } from '@/store/chat/concord';
export function useConcordClient() {
  const runtime = useContext(ConcordContext);
  const nav = useConcordNavigation();
  const selected = runtime.communities.find(community => community.material.community_id === nav.communityId);
  return { ...runtime, ...nav, communityName: selected?.metadata?.name ?? selected?.material.name ?? '', community: runtime.client && nav.communityId ? runtime.client.getCommunity(nav.communityId) : undefined };
}
