/**
 * Relay roles - operator-defined ranks ("Moderator", "Contributor", "OG") that
 * render next to a user's name in chat and in the member list.
 *
 * Stored as NIP-78 (kind 30078) replaceable parameterized events authored by
 * the **relay operator** (NIP-11 `pubkey`), the same trust model as
 * `channel-layout.ts` and `relay-branding.ts`: a channel admin must not gain
 * relay-wide authority, so readers filter on the operator as author and a
 * forged roles event from anyone else is never parsed.
 *
 * Two d-tags:
 *
 *   `obelisk:roles:<relayUrl>`          - the catalog (which roles exist)
 *     ["role", id, name, tier, color, emoji]
 *
 *   `obelisk:role:<relayUrl>:<roleId>`  - that role's holders
 *     ["role", id]
 *     ["p", pubkey] …
 *
 * Holders live in one event per role rather than inside the catalog so that
 * granting or revoking one role never rewrites the others (no lost-update race
 * between two operator sessions) and a role with many holders can't push the
 * catalog past a relay's event-size limit.
 *
 * A user may hold any number of roles; `topRole()` decides the one that shows  - 
 * highest tier wins, ties broken by id so every client picks the same badge.
 * Revoking is removing the pubkey from that role's holder list: the badge falls
 * back to the next-highest role the user still holds, or disappears.
 *
 * This file is the entry point: the model lives in `relay-roles-model.ts`,
 * relay I/O in `relay-roles-sync.ts`, and both are re-exported from here.
 */
import { useEffect, useMemo, useState } from 'react';
import { EMPTY_RELAY_ROLES, type RelayRoles } from './relay-roles-model';
import { subscribeRelayRoles } from './relay-roles-sync';

export {
  DEFAULT_ROLE_COLOR,
  EMPTY_RELAY_ROLES,
  MAX_ROLE_EMOJI_LENGTH,
  MAX_ROLES,
  normalizeRoleColor,
  normalizeRoleEmoji,
  normalizeRoleId,
  parseRoleCatalog,
  parseRoleHolders,
  roleCatalogDTag,
  roleHoldersDTag,
  rolesByPubkey,
  rolesForPubkey,
  sortRoles,
  toRoleCatalogTags,
  toRoleHoldersTags,
  topRole,
} from './relay-roles-model';
export type { RelayRole, RelayRoles, RoleHolders } from './relay-roles-model';
export { publishRoleCatalog, publishRoleHolders, subscribeRelayRoles } from './relay-roles-sync';

export function useRelayRoles(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
): RelayRoles {
  const authorsKey = useMemo(() => [...authors].sort().join(','), [authors]);
  const [state, setState] = useState<RelayRoles>(EMPTY_RELAY_ROLES);
  // Reset on relay change only - authors arriving after first paint would
  // otherwise blank every badge mid-load.
  useEffect(() => {
    setState(EMPTY_RELAY_ROLES);
  }, [relayUrl]);
  useEffect(() => {
    if (!relayUrl || authorsKey.length === 0) return;
    return subscribeRelayRoles(relayUrl, authorsKey.split(','), setState);
  }, [relayUrl, authorsKey]);
  return state;
}
