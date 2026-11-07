import { useActiveCallByChannel, useGroups } from '@/services/nostr-bridge';

/** Passive previews read the shared relay map; they never open a channel REQ or a timer. */
export function usePublicCallPreview(groupId: string) {
  const group = useGroups().find((entry) => entry.id === groupId);
  const call = useActiveCallByChannel()[groupId];
  if (!group?.isPublic || group.isHidden || (group.kind !== 'voice' && group.kind !== 'voice-sfu')) return null;
  if (!call || call.participantCount === 0) return null;
  return call;
}
