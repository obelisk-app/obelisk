/**
 * Instance owner — a single Nostr pubkey that has unconditional owner-level
 * permissions across every server in this Obelisk instance, regardless of
 * Server.ownerPubkey or Member rows. Configured via INSTANCE_OWNER_PUBKEY env.
 *
 * This is distinct from per-server "owner" (Server.ownerPubkey), which only
 * grants ownership of one specific server.
 */

export function getInstanceOwnerPubkey(): string | null {
  const pk = process.env.INSTANCE_OWNER_PUBKEY?.trim();
  return pk && pk.length > 0 ? pk : null;
}

export function isInstanceOwner(pubkey: string | null | undefined): boolean {
  if (!pubkey) return false;
  const owner = getInstanceOwnerPubkey();
  return owner !== null && owner === pubkey;
}
