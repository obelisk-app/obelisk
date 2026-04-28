import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasRole, canWriteInChannel, type Role } from './auth-roles';
import { canReadChannel } from './roles';

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

describe('canReadChannel', () => {
  const roles: Role[] = ['owner', 'admin', 'mod', 'member'];

  it('allows everyone when readPermission is null/everyone', () => {
    for (const role of roles) {
      expect(canReadChannel(role, { readPermission: null })).toBe(true);
      expect(canReadChannel(role, { readPermission: 'everyone' })).toBe(true);
    }
  });

  it('restricts "mod" visibility to mod+', () => {
    expect(canReadChannel('owner', { readPermission: 'mod' })).toBe(true);
    expect(canReadChannel('admin', { readPermission: 'mod' })).toBe(true);
    expect(canReadChannel('mod', { readPermission: 'mod' })).toBe(true);
    expect(canReadChannel('member', { readPermission: 'mod' })).toBe(false);
  });

  it('restricts "admin" visibility to admin+', () => {
    expect(canReadChannel('owner', { readPermission: 'admin' })).toBe(true);
    expect(canReadChannel('admin', { readPermission: 'admin' })).toBe(true);
    expect(canReadChannel('mod', { readPermission: 'admin' })).toBe(false);
    expect(canReadChannel('member', { readPermission: 'admin' })).toBe(false);
  });

  it('with "roles": admins and owners bypass the role list', () => {
    expect(canReadChannel('owner', { readPermission: 'roles', readRoleIds: ['r1'] }, [])).toBe(true);
    expect(canReadChannel('admin', { readPermission: 'roles', readRoleIds: ['r1'] }, [])).toBe(true);
  });

  it('with "roles": mods/members need a matching custom role', () => {
    const ch = { readPermission: 'roles', readRoleIds: ['r1', 'r2'] };
    expect(canReadChannel('member', ch, ['r1'])).toBe(true);
    expect(canReadChannel('member', ch, ['r3'])).toBe(false);
    expect(canReadChannel('member', ch, [])).toBe(false);
    expect(canReadChannel('mod', ch, ['r2'])).toBe(true);
    expect(canReadChannel('mod', ch, [])).toBe(false);
  });

  it('with "roles" and empty readRoleIds: nobody below admin gets in', () => {
    const ch = { readPermission: 'roles', readRoleIds: [] };
    expect(canReadChannel('admin', ch, [])).toBe(true);
    expect(canReadChannel('mod', ch, ['anything'])).toBe(false);
    expect(canReadChannel('member', ch, ['anything'])).toBe(false);
  });
});
