import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import type { GameSession } from '@/lib/games/session/session';
import { useStartTableModal } from '@/hooks/games/start-table/useStartTableModal';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const nameOf = (pubkey: string) => `name-${pubkey}`;

const session = (overrides: Partial<GameSession> = {}) => ({
  game: 'chain-reaction',
  joined: ['alice', 'bob'],
  createdBy: 'alice',
  minPlayers: 2,
  maxPlayers: 3,
  opts: {},
  ...overrides,
}) as unknown as GameSession;

function mount(s = session()) {
  const onStart = vi.fn();
  const { result } = renderHook(() => useStartTableModal(s, nameOf, onStart), { wrapper });
  return { result, onStart };
}

describe('useStartTableModal', () => {
  it('seats every joined account remotely and can start', () => {
    const { result, onStart } = mount();
    expect(result.current.rows.map((r) => [r.row.by, r.shared, r.mode])).toEqual([
      ['alice', false, 'remote'],
      ['bob', false, 'remote'],
    ]);
    expect(result.current).toMatchObject({ canRemove: false, canAdd: true, addDisabled: false, startDisabled: false });
    expect(result.current.meta).toBe('2 of 2–3 seats');
    act(() => result.current.start());
    expect(onStart).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'alice', by: 'alice' }),
      expect.objectContaining({ id: 'bob', by: 'bob' }),
    ]);
  });

  it('turns two seats on one account into a shared machine', () => {
    const { result } = mount();
    act(() => result.current.setController(result.current.rows[1].row.rowId, 'alice'));
    expect(result.current.rows.map((r) => r.mode)).toEqual(['on name-alice\'s machine', 'on name-alice\'s machine']);
  });

  it('adds seats up to the table\'s maximum, and lets them go again above the minimum', () => {
    const { result } = mount();
    act(() => result.current.addRow());
    expect(result.current).toMatchObject({ addDisabled: true, canRemove: true });
    act(() => result.current.removeRow(result.current.rows[2].row.rowId));
    expect(result.current.rows).toHaveLength(2);
  });

  it('will not start below the minimum, and says so', () => {
    const { result } = mount(session({ joined: ['alice'] }));
    expect(result.current.startDisabled).toBe(true);
    expect(result.current.meta).toContain(' · ');
  });

  it('gives a real-time table one seat per device and no extra seats', () => {
    const { result } = mount(session({ game: 'stacker' }));
    expect(result.current.canAdd).toBe(false);
    expect(result.current.rows[0].mode).toBe('own device');
    expect(result.current.rows[0].chips.find((c) => c.pubkey === 'bob')?.disabled).toBe(true);
  });
});
