import type { UserHit } from '@/hooks/identity/useNostrUserSearch';

/** How many people the desktop "New message" search lists. */
export const COMPOSE_DM_MAX_RESULTS = 8;

/**
 * The people search's hits as one list: the decoded key first, then the
 * NIP-05 hit, then name matches, each person once, at most `limit`.
 */
export function mergeUserHits(
  directHit: UserHit | null | undefined,
  nip05Hit: UserHit | null | undefined,
  nostrResults: ReadonlyArray<UserHit>,
  limit = COMPOSE_DM_MAX_RESULTS,
): UserHit[] {
  const seen = new Set<string>();
  return [directHit, nip05Hit, ...nostrResults]
    .filter((hit): hit is UserHit => !!hit && !seen.has(hit.pubkey) && !!seen.add(hit.pubkey))
    .slice(0, limit);
}

/** The highlighted row, kept on the list as it shrinks under the cursor. */
export function clampActiveIndex(active: number, count: number): number {
  return Math.min(active, Math.max(0, count - 1));
}

/** What a key does in the compose search box, or `null` to let it type. */
export type ComposeDmKeyAction =
  | { kind: 'close' }
  | { kind: 'highlight'; index: number }
  | { kind: 'pick'; index: number };

export function composeDmKeyAction(key: string, selected: number, count: number): ComposeDmKeyAction | null {
  if (key === 'Escape') return { kind: 'close' };
  if (key === 'ArrowDown' && count > 0) return { kind: 'highlight', index: (selected + 1) % count };
  if (key === 'ArrowUp' && count > 0) return { kind: 'highlight', index: (selected - 1 + count) % count };
  if (key === 'Enter' && selected < count) return { kind: 'pick', index: selected };
  return null;
}
