import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { useResizablePane } from '@/hooks/shell/desktop/useResizablePane';

const KEY = 'test/hook-pane-width';
const props = { storageKey: KEY, defaultWidth: 260, min: 200, max: 400, side: 'right' as const };

function mouseDown(clientX: number) {
  return { clientX, preventDefault: vi.fn() } as unknown as React.MouseEvent;
}

describe('useResizablePane', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts from the stored width and stores and reports every change', () => {
    window.localStorage.setItem(KEY, '300');
    const onWidthChange = vi.fn();
    const { result } = renderHook(() => useResizablePane({ ...props, onWidthChange }));
    expect(result.current.width).toBe(300);
    expect(onWidthChange).toHaveBeenCalledWith(300);
  });

  it('follows a drag and keeps the final width', () => {
    const { result } = renderHook(() => useResizablePane(props));
    const down = mouseDown(100);
    act(() => result.current.onMouseDown(down));
    expect(down.preventDefault).toHaveBeenCalled();
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 140 })); });
    act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
    expect(result.current.width).toBe(300);
    expect(window.localStorage.getItem(KEY)).toBe('300');
    // After mouse-up the pointer no longer moves the pane.
    act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 })); });
    expect(result.current.width).toBe(300);
  });
});
