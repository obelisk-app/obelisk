import { describe, expect, it } from 'vitest';
import * as model from '@/utils/relay/relay-roles-model';
import { ROLE_ID_RE } from '@/constants/relay/relay-roles-model';
import * as sync from '@/services/relay/relay-roles-sync';
import * as entry from '@/services/relay/relay-roles';

describe('relay-roles-model', () => {
  it('accepts only slug ids', () => {
    expect(ROLE_ID_RE.test('mod_1-a')).toBe(true);
    expect(ROLE_ID_RE.test('Mod')).toBe(false);
    expect(ROLE_ID_RE.test('x'.repeat(33))).toBe(false);
  });

  it('is what the relay-roles entry point re-exports', () => {
    expect(entry.topRole).toBe(model.topRole);
    expect(entry.parseRoleCatalog).toBe(model.parseRoleCatalog);
    expect(entry.EMPTY_RELAY_ROLES).toBe(model.EMPTY_RELAY_ROLES);
    expect(entry.subscribeRelayRoles).toBe(sync.subscribeRelayRoles);
    expect(entry.publishRoleCatalog).toBe(sync.publishRoleCatalog);
  });
});

describe('the roles editor draft', () => {
  const role = (id: string, tier: number) => ({ id, name: id, tier, color: '#fff', emoji: '' });

  it('retier numbers the ladder top-down and densely', () => {
    expect(model.retier([role('a', 9), role('b', 1), role('c', 0)]).map((r) => r.tier)).toEqual([3, 2, 1]);
  });

  it('serializeRoles changes with any published field and not otherwise', () => {
    const base = [role('a', 1)];
    expect(model.serializeRoles(base)).toBe(model.serializeRoles([role('a', 1)]));
    expect(model.serializeRoles(base)).not.toBe(model.serializeRoles([{ ...role('a', 1), color: '#000' }]));
  });
});
