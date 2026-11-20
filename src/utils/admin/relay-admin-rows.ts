/**
 * The relay admin panel's table data: one row per person per channel, and
 * the filters over it. Pure, so the panel's hook only wires state to these.
 */

import { safeNpub } from '@/utils/identity/short-npub';
import type { JsGroup } from '@/services/nostr-bridge';

export interface RelayAdminRow {
  groupId: string;
  groupName: string;
  pubkey: string;
  isAdmin: boolean;
}

export type RelayAdminRoleFilter = 'all' | 'admin' | 'member';

export interface RelayAdminFilters {
  /** Matched against member names, keys and channel names, case-insensitively. */
  text: string;
  role: RelayAdminRoleFilter;
  /** A group id, or `'all'`. */
  group: string;
}

type ByGroup = Readonly<Record<string, ReadonlyArray<string>>>;

/** Stable id of a row: the same person in two channels is two rows. */
export function relayAdminRowKey(row: RelayAdminRow): string {
  return `${row.groupId}/${row.pubkey}`;
}

/** A channel's name for the table, or the start of its id when it has none. */
export function relayAdminGroupName(group: Pick<JsGroup, 'id' | 'name'>, idChars = 8): string {
  return group.name ?? group.id.slice(0, idChars);
}

/** Every admin and member of every group, admins first in each group, each person once per group. */
export function buildRelayAdminRows(
  groups: ReadonlyArray<Pick<JsGroup, 'id' | 'name'>>,
  adminsByGroup: ByGroup,
  membersByGroup: ByGroup,
): RelayAdminRow[] {
  const out: RelayAdminRow[] = [];
  for (const g of groups) {
    const admins = new Set(adminsByGroup[g.id] ?? []);
    const everyone = new Set<string>([...admins, ...(membersByGroup[g.id] ?? [])]);
    for (const pubkey of everyone) {
      out.push({ groupId: g.id, groupName: relayAdminGroupName(g), pubkey, isAdmin: admins.has(pubkey) });
    }
  }
  return out;
}

/** The rows that pass the role, channel and text filters. */
export function filterRelayAdminRows(rows: ReadonlyArray<RelayAdminRow>, filters: RelayAdminFilters, names?: ReadonlyMap<string, string>): RelayAdminRow[] {
  const q = filters.text.trim().toLowerCase();
  return rows.filter((r) => {
    if (filters.role === 'admin' && !r.isAdmin) return false;
    if (filters.role === 'member' && r.isAdmin) return false;
    if (filters.group !== 'all' && r.groupId !== filters.group) return false;
    if (q && !(r.pubkey.toLowerCase().includes(q) || (q.startsWith('npub') && safeNpub(r.pubkey).includes(q)) ||
      names?.get(r.pubkey)?.toLowerCase().includes(q) || r.groupName.toLowerCase().includes(q))) return false;
    return true;
  });
}

/** The selected rows among those shown (a selection hidden by a filter is not acted on). */
export function selectedRelayAdminRows(rows: ReadonlyArray<RelayAdminRow>, selected: ReadonlySet<string>): RelayAdminRow[] {
  return rows.filter((r) => selected.has(relayAdminRowKey(r)));
}

/** A set with `key` added, or removed when it was there. */
export function toggleKey(set: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export interface RelayAdminPerson {
  pubkey: string;
  memberships: RelayAdminRow[];
}

export function groupRelayAdminPeople(rows: readonly RelayAdminRow[]): RelayAdminPerson[] {
  const people = new Map<string, RelayAdminPerson>();
  for (const row of rows) {
    const person = people.get(row.pubkey);
    if (person) person.memberships.push(row);
    else people.set(row.pubkey, { pubkey: row.pubkey, memberships: [row] });
  }
  return [...people.values()];
}

export function relayAdminChannelOptions(groups: readonly Pick<JsGroup, 'id' | 'name'>[]) {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const name = relayAdminGroupName(group, 12);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return groups.map(group => {
    const name = relayAdminGroupName(group, 12);
    return { value: group.id, label: (counts.get(name) ?? 0) > 1 ? `${name} · ${group.id.slice(0, 8)}` : name };
  });
}
