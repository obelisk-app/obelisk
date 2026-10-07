import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { useImageGallery } from '@/hooks/chat/gallery/useImageGallery';
import { useLightbox } from '@/hooks/chat/gallery/useLightbox';

const urls = ['https://x/0.jpg', 'https://x/1.jpg', 'https://x/2.jpg'];

describe('useImageGallery', () => {
  it('open shows the lightbox on that image; next wraps; close hides it', () => {
    const { result } = renderHook(() => useImageGallery(urls), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.layout.tiles).toHaveLength(3);
    act(() => result.current.open(2));
    expect(result.current.lightboxIndex).toBe(2);
    act(() => result.current.next());
    expect(result.current.lightboxIndex).toBe(0);
    act(() => result.current.closeLightbox());
    expect(result.current.lightboxIndex).toBeNull();
    expect(result.current.selectedMedia).toBeNull();
  });

  it('hideImage hides the image that failed', () => {
    const { result } = renderHook(() => useImageGallery(urls), { wrapper: bridgeWrapper(fakeBridge()) });
    const img = document.createElement('img');
    result.current.hideImage({ target: img } as unknown as React.SyntheticEvent<HTMLImageElement>);
    expect(img.style.display).toBe('none');
  });
});

describe('useLightbox', () => {
  const click = () => ({ stopPropagation: vi.fn() }) as unknown as React.MouseEvent;

  it('the buttons keep their click from the backdrop and run their action', () => {
    const onClose = vi.fn(); const onPrev = vi.fn(); const onNext = vi.fn();
    const { result } = renderHook(() => useLightbox(0, onClose, onPrev, onNext));
    const e = click();
    result.current.nextClick(e);
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledOnce();
    result.current.prevClick(click());
    expect(onPrev).toHaveBeenCalledOnce();
    result.current.closeClick(click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('a backdrop click closes while not zoomed; the image is unzoomed with a zoom-in cursor', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useLightbox(0, onClose, () => {}, () => {}));
    expect(result.current.cursor).toBe('zoom-in');
    expect(result.current.transform).toBe('translate(0px, 0px) scale(1)');
    act(() => result.current.backdropClick());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
