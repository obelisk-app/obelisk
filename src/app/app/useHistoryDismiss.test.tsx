import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHistoryDismiss } from './useHistoryDismiss';

describe('useHistoryDismiss', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('pushes one entry when the overlay opens', () => {
    const push = vi.spyOn(window.history, 'pushState');
    renderHook(({ open }) => useHistoryDismiss(open, () => {}), {
      initialProps: { open: true },
    });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('pushes nothing while closed', () => {
    const push = vi.spyOn(window.history, 'pushState');
    renderHook(() => useHistoryDismiss(false, () => {}));
    expect(push).not.toHaveBeenCalled();
  });

  it('closes on back, so a swipe-back does not leave the app', () => {
    // Without this the OS back gesture navigates away from the app entirely,
    // which reads as losing your place rather than closing the reader.
    const onClose = vi.fn();
    renderHook(() => useHistoryDismiss(true, onClose));

    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('consumes its own entry when dismissed from the UI', () => {
    // Otherwise the entry is left behind and back appears to do nothing
    // once for every overlay already dismissed.
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();
    const { result } = renderHook(() => useHistoryDismiss(true, onClose));

    act(() => { result.current(); });
    expect(back).toHaveBeenCalledTimes(1);
    // `onClose` runs from the popstate handler, not twice.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes directly when it never pushed an entry', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const onClose = vi.fn();
    const { result } = renderHook(() => useHistoryDismiss(false, onClose));

    act(() => { result.current(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
  });

  it('does not consume an entry twice after a back press', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const { result } = renderHook(() => useHistoryDismiss(true, () => {}));

    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    act(() => { result.current(); });
    // The entry is already gone; popping again would navigate the app.
    expect(back).not.toHaveBeenCalled();
  });
});
