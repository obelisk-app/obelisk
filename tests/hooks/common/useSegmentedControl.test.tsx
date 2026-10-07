import { renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSegmentedControl } from '@/hooks/common/useSegmentedControl';

const OPTIONS = [{ value: 'a' }, { value: 'b' }, { value: 'c' }] as const;

function key(k: string) {
  return { key: k, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn> };
}

describe('useSegmentedControl', () => {
  it('arrows wrap and Home/End jump, focusing the tab it selects', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSegmentedControl(OPTIONS, 'c', onChange));
    const tabs = OPTIONS.map(() => document.createElement('button'));
    tabs.forEach((tab, i) => { document.body.appendChild(tab); result.current.tabRef(i)(tab); });

    result.current.onKeyDown(key('ArrowRight'));
    expect(onChange).toHaveBeenLastCalledWith('a');
    expect(document.activeElement).toBe(tabs[0]);
    result.current.onKeyDown(key('ArrowUp'));
    expect(onChange).toHaveBeenLastCalledWith('b');
    result.current.onKeyDown(key('Home'));
    expect(onChange).toHaveBeenLastCalledWith('a');
    result.current.onKeyDown(key('End'));
    expect(onChange).toHaveBeenLastCalledWith('c');
    tabs.forEach((tab) => tab.remove());
  });

  it('ignores other keys and an empty bar, without stopping the key', () => {
    const onChange = vi.fn();
    const other = key('a');
    renderHook(() => useSegmentedControl(OPTIONS, 'a', onChange)).result.current.onKeyDown(other);
    const empty = key('ArrowRight');
    renderHook(() => useSegmentedControl([], 'a', onChange)).result.current.onKeyDown(empty);
    expect(onChange).not.toHaveBeenCalled();
    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(empty.preventDefault).not.toHaveBeenCalled();
  });

  it('an unknown value moves from the first tab', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useSegmentedControl<string>(OPTIONS, 'zzz', onChange));
    result.current.onKeyDown(key('ArrowRight'));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
