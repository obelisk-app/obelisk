import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useStackerKeysPanel } from '@/hooks/games/stacker/useStackerKeysPanel';
import { loadKeyMap } from '@/lib/games/stacker/keymap';
import { LocaleProvider } from '@tests/support/intl';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const row = (rows: ReturnType<typeof useStackerKeysPanel>['rows'], action: string) => rows.find((r) => r.action === action)!;
const press = (code: string) => {
  const e = new KeyboardEvent('keydown', { code, cancelable: true });
  act(() => { window.dispatchEvent(e); });
  return e;
};

afterEach(() => localStorage.clear());

describe('useStackerKeysPanel', () => {
  it('starts from the saved map, the space bar worded', () => {
    const { result } = renderHook(() => useStackerKeysPanel(), { wrapper });
    expect(row(result.current.rows, 'hard').keys).toEqual([{ code: 'Space', label: 'Space' }]);
  });

  it('binds the next key to the listening action and swallows it', () => {
    const { result } = renderHook(() => useStackerKeysPanel(), { wrapper });
    act(() => result.current.listen('hold'));
    expect(row(result.current.rows, 'hold').listening).toBe(true);
    const e = press('KeyH');
    expect(e.defaultPrevented).toBe(true);
    expect(row(result.current.rows, 'hold').listening).toBe(false);
    expect(row(result.current.rows, 'hold').keys.map((k) => k.code)).toContain('KeyH');
    expect(loadKeyMap().KeyH).toBe('hold');
  });

  it('cancels on Escape and stops listening after one key', () => {
    const { result } = renderHook(() => useStackerKeysPanel(), { wrapper });
    act(() => result.current.listen('left'));
    press('Escape');
    expect(row(result.current.rows, 'left').listening).toBe(false);
    const after = press('KeyP');
    expect(after.defaultPrevented).toBe(false);
    expect(loadKeyMap().KeyP).toBeUndefined();
  });

  it('unbinds and saves, and resets to the defaults', () => {
    const { result } = renderHook(() => useStackerKeysPanel(), { wrapper });
    act(() => result.current.unbind('KeyZ'));
    expect(row(result.current.rows, 'ccw').keys).toEqual([]);
    expect(loadKeyMap().KeyZ).toBeUndefined();
    act(() => result.current.reset());
    expect(row(result.current.rows, 'ccw').keys.map((k) => k.code)).toEqual(['KeyZ']);
    expect(loadKeyMap().KeyZ).toBe('ccw');
  });
});
