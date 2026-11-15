import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

/** Creation policy only: imported communities may have a different relay count. */
export function parseConcordCreationRelays(input: unknown): readonly [string, string, string] | null {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const relays: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value.trim());
      if (url.protocol !== 'wss:' || url.username || url.password || url.hash) return null;
      const normalized = normalizeRelayUrl(url.toString());
      if (relays.includes(normalized)) return null;
      relays.push(normalized);
    } catch {
      return null;
    }
  }
  return [relays[0], relays[1], relays[2]];
}
