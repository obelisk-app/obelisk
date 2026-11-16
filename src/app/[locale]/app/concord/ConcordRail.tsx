'use client';
import { useConcordClient } from '@/hooks/chat/concord/useConcordClient';
import { RailTile } from '@/app/[locale]/app/rail/RailTile';
export default function ConcordRail() {
  const vm = useConcordClient();
  return <>{vm.communities.map(community => <RailTile key={community.material.community_id}
    title={community.metadata?.name ?? community.material.name}
    active={vm.open && vm.communityId === community.material.community_id}
    onClick={() => vm.selectCommunity(community.material.community_id)}
    icon={<span className="text-lg font-bold">{(community.metadata?.name ?? community.material.name).slice(0, 2).toUpperCase()}</span>} />)}</>;
}
