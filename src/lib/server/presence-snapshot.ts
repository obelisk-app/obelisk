// src/lib/server/presence-snapshot.ts
// Build the "who is online" pubkey list from the live socket map. A pubkey
// appears at most once even if the user has multiple tabs open.

export function buildPresenceSnapshot(
  pubkeySockets: Map<string, Set<string>>,
): string[] {
  const out: string[] = [];
  for (const [pubkey, sockets] of pubkeySockets) {
    if (sockets.size > 0) out.push(pubkey);
  }
  return out;
}
