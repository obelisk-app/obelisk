import { useContext } from 'react';
import { ConcordContext } from '@/contexts/chat/concord';
import { useConcordNavigation } from '@/store/chat/concord';
export function useConcordClient() {
  const runtime = useContext(ConcordContext);
  const nav = useConcordNavigation();
  return { ...runtime, ...nav, community: runtime.client && nav.communityId ? runtime.client.getCommunity(nav.communityId) : undefined };
}
