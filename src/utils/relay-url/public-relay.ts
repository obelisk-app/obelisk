import { parseRelayUrl } from '@nostr-wot/relay';

/**
 * Public-only relay input, preserving the social tier's canonical spelling:
 * URL serialization with one terminal slash removed. This validates input;
 * normalizeRelayUrl is instead the permissive bridge/cache equality key.
 */
export function normalizePublicRelayUrl(value: unknown): string | null {
  const url = parseRelayUrl(value, { policy: 'public-wss' });
  return url ? url.toString().replace(/\/$/, '') : null;
}
