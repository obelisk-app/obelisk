import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLightboxIndex } from '@/hooks/chat/gallery/useLightboxIndex';
import { useZoomPan } from '@/hooks/chat/gallery/useZoomPan';

describe('useLightboxIndex', () => {
  it('wraps around and follows the keyboard while open', () => {
    const { result } = renderHook(() => useLightboxIndex(3));
    act(() => result.current.setLightboxIndex(0));
    act(() => result.current.prev());
    expect(result.current.lightboxIndex).toBe(2);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(result.current.lightboxIndex).toBe(0);
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(result.current.lightboxIndex).toBe(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(result.current.lightboxIndex).toBeNull();
    act(() => result.current.next());
    expect(result.current.lightboxIndex).toBeNull();
  });
});

describe('useZoomPan', () => {
  const wheel = (deltaY: number) => ({ deltaY, preventDefault: () => {} }) as unknown as React.WheelEvent;

  it('zooms within [1, 5] and resets when the image changes', () => {
    const { result, rerender } = renderHook(({ index }) => useZoomPan(index), { initialProps: { index: 0 } });
    act(() => result.current.onWheel(wheel(-500)));
    expect(result.current.scale).toBeCloseTo(2);
    expect(result.current.isZoomed).toBe(true);
    expect(result.current.shouldIgnoreBackdropClick()).toBe(true);
    for (let i = 0; i < 10; i += 1) act(() => result.current.onWheel(wheel(-500)));
    expect(result.current.scale).toBe(5);
    rerender({ index: 1 });
    expect(result.current.scale).toBe(1);
    expect(result.current.shouldIgnoreBackdropClick()).toBe(false);
  });

  it('pans only while zoomed', () => {
    const { result } = renderHook(() => useZoomPan(0));
    const mouse = (x: number, y: number) => ({ clientX: x, clientY: y, stopPropagation: () => {} }) as unknown as React.MouseEvent;
    act(() => result.current.onMouseDown(mouse(0, 0)));
    act(() => result.current.onMouseMove(mouse(10, 10)));
    expect(result.current.tx).toBe(0);
    act(() => result.current.onWheel(wheel(-500)));
    act(() => result.current.onMouseDown(mouse(0, 0)));
    expect(result.current.isDragging).toBe(true);
    act(() => result.current.onMouseMove(mouse(10, 5)));
    expect([result.current.tx, result.current.ty]).toEqual([10, 5]);
    act(() => result.current.onMouseUp());
    expect(result.current.isDragging).toBe(false);
  });
});
