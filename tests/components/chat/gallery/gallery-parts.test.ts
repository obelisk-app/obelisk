import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildGifSelections } from '@/components/chat/gallery/gif-selections';
import { useLightboxIndex } from '@/components/chat/gallery/useLightboxIndex';
import { useZoomPan } from '@/components/chat/gallery/useZoomPan';
import type { JsMediaPack } from '@/services/nostr-bridge';

describe('buildGifSelections', () => {
  it('prefers pack items, then favourites, then relay emoji, then names the file', () => {
    const pack = { items: [{ name: 'p', url: 'https://x/p.gif', kind: 'gif' }] } as unknown as JsMediaPack;
    const out = buildGifSelections(
      { a: pack },
      [{ name: 'p-fav', url: 'https://x/p.gif', kind: 'gif' }, { name: 'f', url: 'https://x/f.gif', kind: 'gif' }],
      { relay: 'https://x/r.gif', still: 'https://x/s.png' },
      { relay: 'gif', still: 'emoji' },
      ['https://media.giphy.com/media/AbC123/giphy.gif', 'https://x/My-Cat.gif', 'https://x/photo.png'],
    );
    expect(out.get('https://x/p.gif')?.pack).toBe(pack);
    expect(out.get('https://x/f.gif')?.item.name).toBe('f');
    expect(out.get('https://x/r.gif')?.item.name).toBe('relay');
    expect(out.has('https://x/s.png')).toBe(false);
    expect(out.get('https://media.giphy.com/media/AbC123/giphy.gif')?.item.name).toBe('abc123');
    expect(out.get('https://x/My-Cat.gif')?.item.name).toBeTruthy();
    expect(out.has('https://x/photo.png')).toBe(false);
  });
});

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
