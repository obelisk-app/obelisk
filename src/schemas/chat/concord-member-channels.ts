import type { CommunityState } from '@applesauce/concord';

export function memberChannelPolicy(state: CommunityState): { roleId: string; enabled: boolean } | undefined {
  const obelisk = state.metadata?.custom?.obelisk;
  if (!obelisk || typeof obelisk !== 'object' || !('memberChannels' in obelisk)) return;
  const policy = obelisk.memberChannels;
  if (!policy || typeof policy !== 'object' || !('roleId' in policy) || !('enabled' in policy) ||
    typeof policy.roleId !== 'string' || !/^[0-9a-f]{64}$/.test(policy.roleId) || typeof policy.enabled !== 'boolean') return;
  return { roleId: policy.roleId, enabled: policy.enabled };
}
