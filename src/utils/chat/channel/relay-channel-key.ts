import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

export function relayChannelKey(relay: string, groupId: string): string {
  return JSON.stringify([normalizeRelayUrl(relay), groupId]);
}
