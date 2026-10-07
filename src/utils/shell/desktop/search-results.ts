import type { JsGroup } from '@/services/nostr-bridge';
import type { UserHit } from '@/hooks/identity/useNostrUserSearch';

/** One person in the search dropdown, with the badge saying how they were found. */
export interface UserSearchRow {
  key: string;
  hit: UserHit;
  badge?: string;
}

/**
 * The people section's rows: the decoded key (badged `npub`), then the
 * NIP-05 hit (badged `NIP-05`), then name matches, each person once.
 */
export function userSearchRows(
  directHit: UserHit | null | undefined,
  nip05Hit: UserHit | null | undefined,
  nostrResults: ReadonlyArray<UserHit>,
): UserSearchRow[] {
  const rows: UserSearchRow[] = [];
  if (directHit) rows.push({ key: `direct-${directHit.pubkey}`, hit: directHit, badge: 'npub' });
  if (nip05Hit && nip05Hit.pubkey !== directHit?.pubkey) {
    rows.push({ key: `nip05-${nip05Hit.pubkey}`, hit: nip05Hit, badge: 'NIP-05' });
  }
  for (const r of nostrResults) {
    if (r.pubkey === directHit?.pubkey || r.pubkey === nip05Hit?.pubkey) continue;
    rows.push({ key: `nostr-${r.pubkey}`, hit: r });
  }
  return rows;
}

/** Channel names by id, for the named channels only. */
export function groupNamesById(groups: ReadonlyArray<JsGroup>): ReadonlyMap<string, string> {
  const m = new Map<string, string>();
  for (const g of groups) if (g.name) m.set(g.id, g.name);
  return m;
}

/** The people and channel sections show for free text only; a `from:` / `in:` query is about messages. */
export function showsEntitySections(raw: string, hasStructuredTokens: boolean): boolean {
  return !hasStructuredTokens && raw.trim().length >= 1;
}

/** The first letter of a name, for an avatar with no picture. */
export function nameInitial(name: string): string {
  return (name[0] || '?').toUpperCase();
}
