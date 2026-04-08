import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasRole, type Role } from './auth-roles';

describe('hasRole', () => {
  const cases: [Role, Role, boolean][] = [
    ['owner', 'owner', true],
    ['owner', 'admin', true],
    ['owner', 'mod', true],
    ['owner', 'member', true],
    ['admin', 'owner', false],
    ['admin', 'admin', true],
    ['admin', 'mod', true],
    ['admin', 'member', true],
    ['mod', 'owner', false],
    ['mod', 'admin', false],
    ['mod', 'mod', true],
    ['mod', 'member', true],
    ['member', 'owner', false],
    ['member', 'admin', false],
    ['member', 'mod', false],
    ['member', 'member', true],
  ];

  it.each(cases)(
    '%s has role %s → %s',
    (memberRole, minimumRole, expected) => {
      expect(hasRole(memberRole, minimumRole)).toBe(expected);
    }
  );
});
