import { LazyVoiceRoom } from '@/app/[locale]/app/lazy-mounts';
import BridgeRoute from '@/components/BridgeRoute';

export const dynamic = 'force-dynamic';

export default async function VoiceChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  // The provider is here, not in `voice/layout.tsx`: the `/voice` form
  // above this page does not use the bridge and ships without it.
  return (
    <BridgeRoute>
      <LazyVoiceRoom channelId={decodeURIComponent(channelId)} />
    </BridgeRoute>
  );
}
