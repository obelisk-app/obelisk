import { describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent } from 'react';
import { navigatePicker, type PickerNav } from '@/hooks/chat/composer/picker-keys';

const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as KeyboardEvent<HTMLElement>;

function nav(over: Partial<PickerNav> = {}): PickerNav & { index: number } {
  const state = { index: 0 };
  return Object.assign(state, {
    open: true,
    count: 3,
    setIndex: (fn: number | ((i: number) => number)) => { state.index = typeof fn === 'function' ? fn(state.index) : fn; },
    choose: vi.fn(),
    close: vi.fn(),
    ...over,
  });
}

describe('navigatePicker', () => {
  it('arrows wrap both ways', () => {
    const n = nav();
    expect(navigatePicker(key('ArrowUp'), n)).toBe(true);
    expect(n.index).toBe(2);
    navigatePicker(key('ArrowDown'), n);
    expect(n.index).toBe(0);
  });

  it('Enter and Tab choose, Escape closes, and each is prevented', () => {
    const n = nav();
    const enter = key('Enter');
    navigatePicker(enter, n);
    navigatePicker(key('Tab'), n);
    expect(n.choose).toHaveBeenCalledTimes(2);
    expect(enter.preventDefault).toHaveBeenCalled();
    navigatePicker(key('Escape'), n);
    expect(n.close).toHaveBeenCalled();
  });

  it('other keys, a closed picker or an empty one fall through', () => {
    expect(navigatePicker(key('a'), nav())).toBe(false);
    expect(navigatePicker(key('Enter'), nav({ open: false }))).toBe(false);
    expect(navigatePicker(key('Enter'), nav({ count: 0 }))).toBe(false);
  });
});
