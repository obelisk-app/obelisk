import type { JsMemberInfo } from '@/services/nostr-bridge';
import { ROLE_CANDIDATE_LIMIT } from '@/constants/admin/relay-roles-members';

/**
 * The people a role can be granted to: relay members who do not hold it yet,
 * matching the search on name, NIP-05 or pubkey, at most 40.
 */
export function roleCandidates(
  people: readonly JsMemberInfo[],
  held: ReadonlySet<string>,
  query: string,
): JsMemberInfo[] {
  const q = query.trim().toLowerCase();
  const pool = people.filter((person) => !held.has(person.pubkey));
  if (!q) return pool.slice(0, ROLE_CANDIDATE_LIMIT);
  return pool
    .filter((person) => `${person.displayName} ${person.nip05 ?? ''} ${person.pubkey}`.toLowerCase().includes(q))
    .slice(0, ROLE_CANDIDATE_LIMIT);
}

/**
 * Whether a pasted pubkey names someone the list does not offer: not a
 * holder and not among the candidates. A stranger the relay has never seen
 * can still be given a role this way.
 */
export function isNewPastedHolder(
  pasted: string | null,
  held: ReadonlySet<string>,
  candidates: readonly JsMemberInfo[],
): pasted is string {
  return !!pasted && !held.has(pasted) && !candidates.some((person) => person.pubkey === pasted);
}
