import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasRole, canWriteInChannel, type Role } from './auth-roles';

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

describe('canWriteInChannel', () => {
  const roles: Role[] = ['owner', 'admin', 'mod', 'member'];

  it('allows everyone when writePermission is null', () => {
    for (const role of roles) {
      expect(canWriteInChannel(role, { writePermission: null })).toBe(true);
    }
  });

  it('allows everyone when writePermission is "everyone"', () => {
    for (const role of roles) {
      expect(canWriteInChannel(role, { writePermission: 'everyone' })).toBe(true);
    }
  });

  it('restricts "mod" channels to mod+', () => {
    expect(canWriteInChannel('owner', { writePermission: 'mod' })).toBe(true);
    expect(canWriteInChannel('admin', { writePermission: 'mod' })).toBe(true);
    expect(canWriteInChannel('mod', { writePermission: 'mod' })).toBe(true);
    expect(canWriteInChannel('member', { writePermission: 'mod' })).toBe(false);
  });

  it('restricts "admin" channels to admin+', () => {
    expect(canWriteInChannel('owner', { writePermission: 'admin' })).toBe(true);
    expect(canWriteInChannel('admin', { writePermission: 'admin' })).toBe(true);
    expect(canWriteInChannel('mod', { writePermission: 'admin' })).toBe(false);
    expect(canWriteInChannel('member', { writePermission: 'admin' })).toBe(false);
  });

  it('treats unknown writePermission values as open (permissive fallback)', () => {
    expect(canWriteInChannel('member', { writePermission: 'garbage' })).toBe(true);
  });
});
