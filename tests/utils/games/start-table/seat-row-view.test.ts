import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import type { Row } from '@/hooks/games/start-table/useSeatRows';
import { seatFooterMeta, seatModeLabel, seatRowViews } from '@/utils/games/start-table/seat-row-view';

const t = translator('en');
const rows: Row[] = [
  { rowId: 'r0', label: 'Ana', by: 'pk-a' },
  { rowId: 'r1', label: 'Beto', by: 'pk-a' },
  { rowId: 'r2', label: 'Cami', by: 'pk-c' },
];
const seatsFor = (pk: string) => rows.filter((r) => r.by === pk).length;

describe('seatRowViews', () => {
  it('marks the seats an account shares and selects each row\'s controller', () => {
    const views = seatRowViews(rows, ['pk-a', 'pk-c'], seatsFor, false);
    expect(views.map((v) => v.shared)).toEqual([true, true, false]);
    expect(views[2].chips).toEqual([
      { pubkey: 'pk-a', selected: false, disabled: false },
      { pubkey: 'pk-c', selected: true, disabled: false },
    ]);
  });

  it('on a real-time table, will not hand an account already seated a second seat', () => {
    const views = seatRowViews(rows, ['pk-a', 'pk-c', 'pk-d'], seatsFor, true);
    expect(views[2].chips.map((c) => c.disabled)).toEqual([true, false, false]);
  });
});

describe('seatModeLabel', () => {
  it('says how a seat will be played', () => {
    expect(seatModeLabel(t, true, true, 'Ana')).toBe(t('games.startTable.ownDevice'));
    expect(seatModeLabel(t, false, true, 'Ana')).toBe(t('games.startTable.onMachine', { name: 'Ana' }));
    expect(seatModeLabel(t, false, false, 'Ana')).toBe(t('games.startTable.remote'));
  });
});

describe('seatFooterMeta', () => {
  const counts = { rows: 2, min: 2, max: 8, saved: null };
  const ok = { tooFew: false, tooMany: false, wrongForSave: false };

  it('counts the seats', () => {
    expect(seatFooterMeta(t, counts, ok)).toBe('2 of 2–8 seats');
  });

  it('adds whatever stops the start', () => {
    const meta = seatFooterMeta(t, { ...counts, rows: 1, saved: 3 }, { tooFew: true, tooMany: false, wrongForSave: true });
    expect(meta.split(' · ')).toEqual([
      t('games.startTable.seatCount', { count: 1, min: 2, max: 8 }),
      t('games.startTable.needsMore'),
      t('games.startTable.saveHas', { count: 3 }),
    ]);
  });
});
