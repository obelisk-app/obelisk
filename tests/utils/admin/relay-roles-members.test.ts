import { describe, expect, it } from 'vitest';
import { isNewPastedHolder, roleCandidates } from '@/utils/admin/relay-roles-members';
import { ROLE_CANDIDATE_LIMIT } from '@/constants/admin/relay-roles-members';

const person = (pubkey: string, displayName: string, nip05?: string) => ({ pubkey, displayName, nip05, role: 'member' as const });
const ALICE = person('a'.repeat(64), 'Alice', 'alice@obelisk.ar');
const BOB = person('b'.repeat(64), 'Bob Builder');

describe('roleCandidates', () => {
  it('leaves holders out and matches name, NIP-05 or pubkey, ignoring case and spaces', () => {
    const held = new Set([BOB.pubkey]);
    expect(roleCandidates([ALICE, BOB], held, '')).toEqual([ALICE]);
    expect(roleCandidates([ALICE, BOB], new Set(), '  BUILDER ')).toEqual([BOB]);
    expect(roleCandidates([ALICE, BOB], new Set(), 'obelisk.ar')).toEqual([ALICE]);
    expect(roleCandidates([ALICE, BOB], new Set(), 'bbbb')).toEqual([BOB]);
    expect(roleCandidates([ALICE, BOB], new Set(), 'nobody')).toEqual([]);
  });

  it('shows at most 40', () => {
    const many = Array.from({ length: 50 }, (_, i) => person(i.toString(16).padStart(64, '0'), `P${i}`));
    expect(roleCandidates(many, new Set(), '')).toHaveLength(ROLE_CANDIDATE_LIMIT);
    expect(roleCandidates(many, new Set(), 'p')).toHaveLength(ROLE_CANDIDATE_LIMIT);
  });
});

describe('isNewPastedHolder', () => {
  it('is true only for a pasted key that is neither held nor offered', () => {
    const stranger = 'f'.repeat(64);
    expect(isNewPastedHolder(null, new Set(), [])).toBe(false);
    expect(isNewPastedHolder(stranger, new Set(), [ALICE])).toBe(true);
    expect(isNewPastedHolder(stranger, new Set([stranger]), [])).toBe(false);
    expect(isNewPastedHolder(ALICE.pubkey, new Set(), [ALICE])).toBe(false);
  });
});
