import { describe, expect, it } from 'vitest';
import { searchBarKeyAction } from '@/utils/shell/desktop/search-keys';

describe('searchBarKeyAction', () => {
  it('Escape clears a query, then closes', () => {
    expect(searchBarKeyAction('Escape', 'hello', 3, 0)).toEqual({ kind: 'clear' });
    expect(searchBarKeyAction('Escape', '', 0, -1)).toEqual({ kind: 'close' });
  });

  it('arrows and Enter act only while there are results', () => {
    expect(searchBarKeyAction('ArrowDown', 'x', 0, -1)).toBeNull();
    expect(searchBarKeyAction('ArrowDown', 'x', 2, -1)).toEqual({ kind: 'move', delta: 1 });
    expect(searchBarKeyAction('ArrowUp', 'x', 2, 1)).toEqual({ kind: 'move', delta: -1 });
    expect(searchBarKeyAction('Enter', 'x', 2, 1)).toEqual({ kind: 'jump', index: 1 });
  });

  it('Enter with nothing highlighted, and other keys, type as usual', () => {
    expect(searchBarKeyAction('Enter', 'x', 2, -1)).toBeNull();
    expect(searchBarKeyAction('a', 'x', 2, 0)).toBeNull();
  });
});
