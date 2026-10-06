import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { parsePubkeyInput, retier, serializeRoles } from '@/components/admin/relay-roles/role-draft';

const role = (id: string, tier: number) => ({ id, name: id, tier, color: '#fff', emoji: '' });

describe('role-draft', () => {
  it('parses hex, npub and nprofile, and refuses anything else', () => {
    const hex = 'ab'.repeat(32);
    expect(parsePubkeyInput(` ${hex.toUpperCase()} `)).toBe(hex);
    expect(parsePubkeyInput(nip19.npubEncode(hex))).toBe(hex);
    expect(parsePubkeyInput(nip19.nprofileEncode({ pubkey: hex }))).toBe(hex);
    expect(parsePubkeyInput('bob')).toBeNull();
  });

  it('retier numbers the ladder top-down and densely', () => {
    expect(retier([role('a', 9), role('b', 1), role('c', 0)]).map((r) => r.tier)).toEqual([3, 2, 1]);
  });

  it('serializeRoles changes with any published field and not otherwise', () => {
    const base = [role('a', 1)];
    expect(serializeRoles(base)).toBe(serializeRoles([role('a', 1)]));
    expect(serializeRoles(base)).not.toBe(serializeRoles([{ ...role('a', 1), color: '#000' }]));
  });
});
