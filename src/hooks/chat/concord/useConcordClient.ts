import { useContext } from 'react';
import { ConcordContext } from '@/contexts/chat/concord';
import { useConcordNavigation } from '@/store/chat/concord';
export function useConcordClient() {
  const runtime = useContext(ConcordContext);
  const nav = useConcordNavigation();
  const selected = runtime.communities.find(community => community.material.community_id === nav.communityId);
  const railCommunities = runtime.communities.flatMap(state => {
    const community = runtime.client?.getCommunity(state.material.community_id);
    return community ? [community] : [];
  });
  return { railCommunities, ...runtime, ...nav, communityName: selected?.metadata?.name ?? selected?.material.name ?? '', community: runtime.client && nav.communityId ? runtime.client.getCommunity(nav.communityId) : undefined };
}
