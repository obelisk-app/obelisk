'use client';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordBranding } from '@/hooks/chat/concord/useConcordBranding';
import { RailTile } from '@/app/[locale]/app/rail/RailTile';
import RemoteImage from '@/components/ui/media/RemoteImage';

export default function ConcordRailTile({ community, active, onClick }: {
  community: ConcordCommunity; active: boolean; onClick: () => void;
}) {
  const { branding } = useConcordBranding(community, false);
  return <RailTile title={branding.name} active={active} onClick={onClick}
    icon={branding.icon ? <RemoteImage src={branding.icon} alt="" className="h-full w-full rounded-[inherit] object-cover" data-testid="concord-rail-icon" />
      : <span className="text-lg font-bold">{branding.name.slice(0, 2).toUpperCase()}</span>} />;
}
