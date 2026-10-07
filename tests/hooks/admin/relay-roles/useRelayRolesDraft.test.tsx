import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { useRelayRolesDraft } from '@/hooks/admin/relay-roles/useRelayRolesDraft';
import * as roles from '@/services/relay/relay-roles';
import type { RelayRoles } from '@/services/relay/relay-roles';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const RELAY = 'wss://relay.test';
const SAVED: RelayRoles = {
  roles: [
    { id: 'mod', name: 'Moderator', tier: 2, color: '#ff0000', emoji: '' },
    { id: 'og', name: 'OG', tier: 1, color: '#00ff00', emoji: '' },
  ],
  holders: { mod: ['a'.repeat(64)], og: [] },
  updatedAt: 1,
};

afterEach(() => vi.restoreAllMocks());

describe('useRelayRolesDraft', () => {
  it('starts clean, and an edit makes it dirty', () => {
    const { result } = renderHook(() => useRelayRolesDraft(RELAY, SAVED), { wrapper });
    expect(result.current.dirty).toBe(false);
    act(() => result.current.updateRole('og', { name: 'Old Guard' }));
    expect(result.current.dirty).toBe(true);
  });

  it('adds a role at the bottom and refuses duplicates and empty names', () => {
    const { result } = renderHook(() => useRelayRolesDraft(RELAY, SAVED), { wrapper });
    act(() => result.current.setNewName('!!'));
    act(() => result.current.addRole());
    expect(result.current.message).toMatch(/at least one letter/);
    act(() => result.current.setNewName('Mod'));
    act(() => result.current.addRole());
    expect(result.current.message).toMatch(/already exists/);
    act(() => result.current.setNewName('Helper'));
    act(() => result.current.addRole());
    expect(result.current.draft.map((r) => [r.id, r.tier])).toEqual([['mod', 3], ['og', 2], ['helper', 1]]);
    expect(result.current.newName).toBe('');
  });

  it('a move and its undo is not a change', () => {
    const { result } = renderHook(() => useRelayRolesDraft(RELAY, SAVED), { wrapper });
    act(() => result.current.move(1, -1));
    expect(result.current.dirty).toBe(true);
    act(() => result.current.move(0, 1));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.move(0, -1));
    expect(result.current.dirty).toBe(false);
  });

  it('saves the re-tiered catalog and reports it', async () => {
    const publish = vi.spyOn(roles, 'publishRoleCatalog').mockResolvedValue(undefined);
    const { result } = renderHook(() => useRelayRolesDraft(RELAY, SAVED), { wrapper });
    act(() => result.current.move(1, -1));
    await act(async () => { await result.current.saveRoles(); });
    expect(publish).toHaveBeenCalledWith(RELAY, [
      expect.objectContaining({ id: 'og', tier: 2 }),
      expect.objectContaining({ id: 'mod', tier: 1 }),
    ]);
    expect(result.current.message).toBe('Roles saved.');
    expect(result.current.busy).toBe(false);
  });

  it('a failed publish shows the error', async () => {
    vi.spyOn(roles, 'publishRoleHolders').mockRejectedValue(new Error('relay said no'));
    const { result } = renderHook(() => useRelayRolesDraft(RELAY, SAVED), { wrapper });
    await act(async () => { await result.current.grant(SAVED.roles[1], 'b'.repeat(64)); });
    expect(result.current.message).toBe('Could not publish the roles.');
  });

  it('removing an unsaved role needs no confirmation and collapses it', () => {
    const { result } = renderHook(() => useRelayRolesDraft(RELAY, SAVED), { wrapper });
    act(() => result.current.setNewName('Temp'));
    act(() => result.current.addRole());
    act(() => result.current.toggleExpanded('temp'));
    expect(result.current.expanded).toBe('temp');
    const temp = result.current.draft.find((r) => r.id === 'temp');
    if (!temp) throw new Error('missing');
    return act(async () => { await result.current.removeRole(temp); }).then(() => {
      expect(result.current.draft.some((r) => r.id === 'temp')).toBe(false);
      expect(result.current.expanded).toBeNull();
    });
  });
});
