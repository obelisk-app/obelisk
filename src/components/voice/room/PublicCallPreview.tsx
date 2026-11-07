'use client';

import { usePublicCallPreview } from '@/hooks/voice/room/usePublicCallPreview';
import { passiveCallCount } from '@/utils/voice/room-view';
import PassiveCallRoster from './PassiveCallRoster';

/** Public channel/chat preview, using advertised identities and cached profile labels only. */
export function PublicCallPreview({ groupId }: { groupId: string }) {
  const call = usePublicCallPreview(groupId);
  if (!call) return null;
  return <PassiveCallRoster pubkeys={call.participantPubkeys ?? []} count={passiveCallCount(call)} mode={call.mode} cachedOnly />;
}
