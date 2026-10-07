import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { describe, expect, it } from 'vitest';
import type { GameSession } from '@/lib/games/session/session';
import { useSeatRows } from '@/hooks/games/start-table/useSeatRows';
import { seatSpecsFor } from '@/utils/games/start-table/seat-specs';

/** The hook words its defaults through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

const nameOf = (pubkey: string) => `name-${pubkey}`;

const session = (overrides: Partial<GameSession> = {}) => ({
  joined: ['alice', 'bob'],
  createdBy: 'alice',
  minPlayers: 2,
  maxPlayers: 4,
  opts: {},
  ...overrides,
}) as unknown as GameSession;

describe('seatSpecsFor', () => {
  it('gives the first seat an account holds its pubkey and numbers the rest', () => {
    const seats = seatSpecsFor([
      { rowId: 'a', label: 'One', by: 'alice' },
      { rowId: 'b', label: '', by: 'alice' },
      { rowId: 'c', label: 'Bob', by: 'bob' },
    ], nameOf);
    expect(seats[0]).toMatchObject({ id: 'alice', by: 'alice', label: 'One' });
    expect(seats[1].id).not.toBe('alice');
    expect(seats[1].label).toBe('name-alice');
    expect(seats[2]).toMatchObject({ id: 'bob', by: 'bob' });
  });
});

describe('useSeatRows', () => {
  it('starts with one seat per joined account', () => {
    const { result } = renderHook(() => useSeatRows(session(), nameOf), { wrapper });
    expect(result.current.rows.map((r) => r.by)).toEqual(['alice', 'bob']);
    expect(result.current.tooFew).toBe(false);
  });

  it('adds, moves, renames, reassigns and removes seats', () => {
    const { result } = renderHook(() => useSeatRows(session(), nameOf), { wrapper });
    act(() => result.current.addRow());
    expect(result.current.rows).toHaveLength(3);
    expect(result.current.rows[2].by).toBe('alice');
    act(() => result.current.move(0, 1));
    expect(result.current.rows[0].by).toBe('bob');
    act(() => result.current.rename(result.current.rows[0].rowId, 'x'.repeat(40)));
    expect(result.current.rows[0].label).toHaveLength(32);
    act(() => result.current.setController(result.current.rows[0].rowId, 'alice'));
    expect(result.current.seatsFor('alice')).toBe(3);
    act(() => result.current.removeRow(result.current.rows[2].rowId));
    expect(result.current.rows).toHaveLength(2);
  });

  it('flags a table with too few seats', () => {
    const { result } = renderHook(() => useSeatRows(session({ joined: ['alice'] }), nameOf), { wrapper });
    expect(result.current.tooFew).toBe(true);
  });
});
