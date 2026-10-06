import { describe, expect, it } from 'vitest';
import * as model from '@/services/relay-roles-model';
import * as sync from '@/services/relay-roles-sync';
import * as entry from '@/services/relay-roles';

describe('relay-roles-model', () => {
  it('accepts only slug ids', () => {
    expect(model.ROLE_ID_RE.test('mod_1-a')).toBe(true);
    expect(model.ROLE_ID_RE.test('Mod')).toBe(false);
    expect(model.ROLE_ID_RE.test('x'.repeat(33))).toBe(false);
  });

  it('is what the relay-roles entry point re-exports', () => {
    expect(entry.topRole).toBe(model.topRole);
    expect(entry.parseRoleCatalog).toBe(model.parseRoleCatalog);
    expect(entry.EMPTY_RELAY_ROLES).toBe(model.EMPTY_RELAY_ROLES);
    expect(entry.subscribeRelayRoles).toBe(sync.subscribeRelayRoles);
    expect(entry.publishRoleCatalog).toBe(sync.publishRoleCatalog);
  });
});
