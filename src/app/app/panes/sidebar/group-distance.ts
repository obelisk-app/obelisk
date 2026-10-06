import type { JsGroup } from '@/services/nostr-bridge';

/**
 * Each channel's web-of-trust distance: the closest of its creator, admins
 * and members, or `null` when none of them is in the graph.
 */
export function groupDistances(
  groups: ReadonlyArray<JsGroup>,
  creatorsByGroup: Readonly<Record<string, string>>,
  adminsByGroup: Readonly<Record<string, ReadonlyArray<string>>>,
  membersByGroup: Readonly<Record<string, ReadonlyArray<string>>>,
  getDistance: (pubkey: string) => number | null,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const g of groups) {
    const creator = creatorsByGroup[g.id];
    const principals = creator
      ? [creator, ...(adminsByGroup[g.id] ?? []), ...(membersByGroup[g.id] ?? [])]
      : [...(adminsByGroup[g.id] ?? []), ...(membersByGroup[g.id] ?? [])];
    let best: number | null = null;
    for (const pk of principals) {
      const d = getDistance(pk);
      if (d === null) continue;
      if (best === null || d < best) best = d;
    }
    out[g.id] = best;
  }
  return out;
}
