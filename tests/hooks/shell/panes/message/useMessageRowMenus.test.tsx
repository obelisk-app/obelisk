import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMessageRowMenus } from '@/hooks/shell/panes/message/useMessageRowMenus';

describe('useMessageRowMenus', () => {
  it('skips native disabled menu items during arrow navigation', () => {
    const { result } = renderHook(() => useMessageRowMenus());
    const panel = document.createElement('div');
    panel.innerHTML = '<button>Forward</button><button role="menuitem" disabled>Zap</button><button role="menuitem">Copy</button>';
    document.body.append(panel);
    result.current.menuPanelRef.current = panel;
    act(() => result.current.toggleMenu());
    expect(document.activeElement?.textContent).toBe('Forward');
    act(() => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('Copy');
    act(() => result.current.closeAll());
    panel.remove();
  });

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
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
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

  it('keeps portaled menu and picker presses inside the dismissal boundary', () => {
    const { result } = renderHook(() => useMessageRowMenus());
    const panel = document.createElement('div');
    const child = document.createElement('button');
    panel.append(child);
    document.body.append(panel);
    try {
      result.current.pickerPanelRef.current = panel;
      act(() => result.current.openPicker());
      act(() => child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(result.current.pickerOpen).toBe(true);
      expect(result.current.panelPinned).toBe(true);
      act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(result.current.pickerOpen).toBe(false);
      expect(result.current.panelPinned).toBe(false);
    } finally {
      panel.remove();
    }
  });
});
