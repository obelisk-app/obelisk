/**
 * The people search's hits as one list: the decoded key first, then the
 * NIP-05 hit, then the name matches, each person once (the first hit wins),
 * at most `limit`. The desktop and phone "New message" searches and the
 * feed's search all list people this way.
 */
export function mergeUserHits<H extends { pubkey: string }>(
  directHit: H | null | undefined,
  nip05Hit: H | null | undefined,
  nameHits: ReadonlyArray<H>,
  limit = Infinity,
): H[] {
  const seen = new Set<string>();
  return [directHit, nip05Hit, ...nameHits]
    .filter((hit): hit is H => !!hit && !seen.has(hit.pubkey) && !!seen.add(hit.pubkey))
    .slice(0, limit);
}
