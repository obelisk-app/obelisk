import { describe, expect, it } from 'vitest';
import { BINDABLE, defaultKeyMap } from '@/lib/games/stacker/keymap';
import { keyRows } from '@/utils/games/stacker/key-rows';

describe('keyRows', () => {
  it('lists every bindable action in order with its legends', () => {
    const rows = keyRows(defaultKeyMap(), null, 'Espacio');
    expect(rows.map((r) => r.action)).toEqual(BINDABLE.map((b) => b.action));
    expect(rows.find((r) => r.action === 'cw')!.keys).toEqual([
      { code: 'ArrowUp', label: '↑' },
      { code: 'KeyX', label: 'X' },
    ]);
    expect(rows.every((r) => !r.listening)).toBe(true);
  });

  it('words the space bar in the reader\'s language', () => {
    const hard = keyRows(defaultKeyMap(), null, 'Espacio').find((r) => r.action === 'hard')!;
    expect(hard.keys).toEqual([{ code: 'Space', label: 'Espacio' }]);
  });

  it('marks the action that is listening, and shows an action with no keys', () => {
    const rows = keyRows({ KeyQ: 'left' }, 'hold', 'Space');
    expect(rows.find((r) => r.action === 'hold')).toEqual({ action: 'hold', keys: [], listening: true });
    expect(rows.find((r) => r.action === 'left')!.keys).toEqual([{ code: 'KeyQ', label: 'Q' }]);
  });
});
