import { LazyVoiceRoom } from '@/app/app/lazy-mounts';

export const dynamic = 'force-dynamic';

export default async function VoiceChannelPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const { channelId } = await params;
  return <LazyVoiceRoom channelId={decodeURIComponent(channelId)} />;
}
