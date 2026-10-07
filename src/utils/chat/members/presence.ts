/**
 * The key a member's recent activity is filed under: one per relay and pubkey.
 */
export function presenceActivityKey(relayUrl: string, pubkey: string): string {
  const relay = relayUrl.endsWith('/') ? relayUrl.slice(0, -1) : relayUrl;
  return relay.toLowerCase() + ':' + pubkey.toLowerCase();
}
