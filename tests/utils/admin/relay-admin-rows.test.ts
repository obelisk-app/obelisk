import { describe, expect, it } from 'vitest';
import {
  buildRelayAdminRows, filterRelayAdminRows, relayAdminGroupName, relayAdminRowKey, selectedRelayAdminRows, toggleKey,
  type RelayAdminRow,
} from '@/utils/admin/relay-admin-rows';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const groups = [{ id: 'g1', name: 'general' }, { id: 'g2-0123456789abcdef', name: null }];

describe('buildRelayAdminRows', () => {
  const rows = buildRelayAdminRows(groups, { g1: [A] }, { g1: [A, B], 'g2-0123456789abcdef': [C] });

  it('makes one row per person per channel, admins first, each person once', () => {
    expect(rows.map((r) => [r.groupId, r.pubkey, r.isAdmin])).toEqual([
      ['g1', A, true],
      ['g1', B, false],
      ['g2-0123456789abcdef', C, false],
    ]);
  });

  it('names a nameless channel by the start of its id', () => {
    expect(rows[2].groupName).toBe('g2-01234');
    expect(relayAdminGroupName({ id: 'g2-0123456789abcdef', name: null }, 12)).toBe('g2-012345678');
  });

  it('keys a row by channel and person', () => {
    expect(relayAdminRowKey(rows[1])).toBe(`g1/${B}`);
  });

  it('handles a group with no admins or members', () => {
    expect(buildRelayAdminRows([{ id: 'empty', name: 'x' }], {}, {})).toEqual([]);
  });
});

describe('filterRelayAdminRows', () => {
  const rows: RelayAdminRow[] = [
    { groupId: 'g1', groupName: 'General', pubkey: A, isAdmin: true },
    { groupId: 'g1', groupName: 'General', pubkey: B, isAdmin: false },
    { groupId: 'g2', groupName: 'random', pubkey: C, isAdmin: false },
  ];
  const all = { text: '', role: 'all' as const, group: 'all' };

  it('keeps everything with no filter', () => {
    expect(filterRelayAdminRows(rows, all)).toHaveLength(3);
  });

  it('filters by role', () => {
    expect(filterRelayAdminRows(rows, { ...all, role: 'admin' }).map((r) => r.pubkey)).toEqual([A]);
    expect(filterRelayAdminRows(rows, { ...all, role: 'member' }).map((r) => r.pubkey)).toEqual([B, C]);
  });

  it('filters by channel', () => {
    expect(filterRelayAdminRows(rows, { ...all, group: 'g2' }).map((r) => r.pubkey)).toEqual([C]);
  });

  it('matches text in the key or the channel name, ignoring case and spaces around it', () => {
    expect(filterRelayAdminRows(rows, { ...all, text: '  GENERAL ' })).toHaveLength(2);
    expect(filterRelayAdminRows(rows, { ...all, text: 'ccc' }).map((r) => r.pubkey)).toEqual([C]);
  });
});

describe('selection helpers', () => {
  it('toggles a key in and out without touching the original set', () => {
    const start = new Set(['x']);
    const added = toggleKey(start, 'y');
    expect([...added]).toEqual(['x', 'y']);
    expect([...toggleKey(added, 'x')]).toEqual(['y']);
    expect([...start]).toEqual(['x']);
  });

  it('acts only on selected rows that are still shown', () => {
    const rows: RelayAdminRow[] = [{ groupId: 'g1', groupName: 'g', pubkey: A, isAdmin: false }];
    expect(selectedRelayAdminRows(rows, new Set([`g1/${A}`, `g9/${B}`]))).toEqual(rows);
  });
});
