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

  /*
   * Stacking overlays pass a depth. The reader is one: a note opened from
   * inside a thread is a new level, and back has to return to the thread
   * rather than closing the pane — which is what one entry for the whole
   * pane did, because every level after the first was invisible to history.
   */
  describe('as a stack', () => {
    it('pushes one entry per level', () => {
      const push = vi.spyOn(window.history, 'pushState');
      const { rerender } = renderHook(
        ({ depth }) => useHistoryDismiss(depth, () => {}),
        { initialProps: { depth: 1 } },
      );
      expect(push).toHaveBeenCalledTimes(1);

      rerender({ depth: 2 });
      expect(push).toHaveBeenCalledTimes(2);

      rerender({ depth: 3 });
      expect(push).toHaveBeenCalledTimes(3);
    });

    it('does not re-push when the depth is unchanged', () => {
      const push = vi.spyOn(window.history, 'pushState');
      const { rerender } = renderHook(
        ({ depth }) => useHistoryDismiss(depth, () => {}),
        { initialProps: { depth: 2 } },
      );
      const before = push.mock.calls.length;
      rerender({ depth: 2 });
      expect(push).toHaveBeenCalledTimes(before);
    });

    /** Going back up a level must not re-push on the way down again. */
    it('pushes again only for levels it has not seen', () => {
      const push = vi.spyOn(window.history, 'pushState');
      const { rerender } = renderHook(
        ({ depth }) => useHistoryDismiss(depth, () => {}),
        { initialProps: { depth: 1 } },
      );
      rerender({ depth: 2 });
      expect(push).toHaveBeenCalledTimes(2);
      // Popped back to one level; history consumed the entry itself.
      rerender({ depth: 1 });
      expect(push).toHaveBeenCalledTimes(2);
    });

    it('pops one level per back, rather than closing outright', () => {
      const onPop = vi.fn();
      renderHook(() => useHistoryDismiss(3, onPop));
      act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
      expect(onPop).toHaveBeenCalledTimes(1);
    });

    it('treats zero depth as closed', () => {
      const push = vi.spyOn(window.history, 'pushState');
      renderHook(() => useHistoryDismiss(0, () => {}));
      expect(push).not.toHaveBeenCalled();
    });

    it('still consumes an entry when dismissed from the UI at depth', () => {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
      const { result } = renderHook(() => useHistoryDismiss(2, () => {}));
      act(() => { result.current(); });
      expect(back).toHaveBeenCalledTimes(1);
    });
  });
});
