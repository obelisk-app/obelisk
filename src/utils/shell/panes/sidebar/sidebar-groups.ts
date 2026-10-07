import type { JsGroup } from '@/services/nostr-bridge';

/**
 * The desktop sidebar's view of the relay's groups. Pure.
 */

/** Every group by id. */
export function indexGroupsById(groups: ReadonlyArray<JsGroup>): Record<string, JsGroup> {
  return Object.fromEntries(groups.map((g) => [g.id, g]));
}

/** The groups at the root of the tree: no parent, or a parent this client does not know (shown on its own rather than lost). */
export function rootGroups(groups: ReadonlyArray<JsGroup>, groupsById: Readonly<Record<string, JsGroup>>): JsGroup[] {
  return groups.filter((g) => !g.parent || !groupsById[g.parent]);
}
