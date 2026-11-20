'use client';

import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordBranding } from '@/hooks/chat/concord/useConcordBranding';
import CommunityDeckCard, { type CommunityDeckPosition } from '@/components/relay/CommunityDeckCard';

export default function ConcordDeckCard({ community, ...position }: CommunityDeckPosition & { community: ConcordCommunity }) {
  const { branding } = useConcordBranding(community);
  return <CommunityDeckCard {...position} {...branding} sourceKey={community.communityId} testId="concord-deck-card" />;
}
