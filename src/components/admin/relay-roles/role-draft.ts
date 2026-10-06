import { nip19 } from 'nostr-tools';
import type { RelayRole } from '@/services/relay-roles';

/** Accepts an npub or a raw hex pubkey; returns hex, or null if neither. */
export function parsePubkeyInput(value: string): string | null {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch {
    // Not a bech32 entity: fall through.
  }
  return null;
}

/** What Save would publish, as a comparable string: id, name, tier, color, emoji per role. */
export function serializeRoles(list: ReadonlyArray<RelayRole>): string {
  return JSON.stringify(list.map((role) => [role.id, role.name, role.tier, role.color, role.emoji]));
}

/** Tiers are dense and descending by list position: top row is most senior. */
export function retier(roles: ReadonlyArray<RelayRole>): RelayRole[] {
  return roles.map((role, index) => ({ ...role, tier: roles.length - index }));
}
