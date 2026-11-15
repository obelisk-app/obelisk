import type { CommunityChannelRef, CommunityRef } from '@/types/chat/community';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

/** Tuple encoding prevents separators in relay URLs or channel ids colliding. */
export function communityKey(ref: CommunityRef): string {
  return JSON.stringify(ref.protocol === 'nip29'
    ? ['nip29', normalizeRelayUrl(ref.relay)]
    : ['concord', ref.communityId]);
}

export function communityChannelKey(ref: CommunityChannelRef): string {
  return JSON.stringify([communityKey(ref.community), ref.channelId]);
}
