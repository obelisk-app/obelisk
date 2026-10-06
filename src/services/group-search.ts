/**
 * Client-side filter over the user's joined NIP-29 groups.
 *
 * There is no standard NIP-29 group-discovery filter that all relays honor,
 * so "channel search" is intentionally limited to groups the user has
 * already joined (returned by `useGroups()`). The match is a case-insensitive
 * substring against `name`, `about`, and `id`.
 */

import type { JsGroup } from '@/services/nostr-bridge';

export function searchGroups(
  groups: ReadonlyArray<JsGroup>,
  q: string,
): JsGroup[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return groups.filter((g) => {
    if (g.name && g.name.toLowerCase().includes(needle)) return true;
    if (g.about && g.about.toLowerCase().includes(needle)) return true;
    if (g.id.toLowerCase().includes(needle)) return true;
    return false;
  });
}
