import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMessageRowMenus } from '@/app/app/panes/message/useMessageRowMenus';

describe('useMessageRowMenus', () => {
  it('opening the picker from the menu closes the menu and pins the toolbar', () => {
    const { result } = renderHook(() => useMessageRowMenus());
    act(() => result.current.toggleMenu());
    expect(result.current.menuOpen).toBe(true);
    act(() => result.current.openPicker());
    expect(result.current.menuOpen).toBe(false);
    expect(result.current.pickerOpen).toBe(true);
    expect(result.current.panelPinned).toBe(true);
  });

  it('opening the menu closes the picker', () => {
    const { result } = renderHook(() => useMessageRowMenus());
    act(() => result.current.togglePicker());
    act(() => result.current.toggleMenu());
    expect(result.current.pickerOpen).toBe(false);
    expect(result.current.menuOpen).toBe(true);
  });

  it('Escape closes everything that is open', () => {
    const { result } = renderHook(() => useMessageRowMenus());
    act(() => result.current.togglePicker());
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.pickerOpen).toBe(false);
    expect(result.current.panelPinned).toBe(false);
  });

  it('a click outside the row closes it; nothing listens while all is closed', () => {
    const { result } = renderHook(() => useMessageRowMenus());
    act(() => result.current.togglePinned());
    expect(result.current.panelPinned).toBe(true);
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.panelPinned).toBe(false);
  });
});
