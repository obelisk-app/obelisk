import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAnchoredPosition } from '@/hooks/common/useAnchoredPosition';

const box = { top: 100, bottom: 132, left: 900, right: 932, width: 32, height: 32, x: 900, y: 100, toJSON: () => ({}) } as DOMRect;

function refs() {
  const anchor = document.createElement('button');
  const panel = document.createElement('div');
  document.body.append(anchor, panel);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(box);
  Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 200 });
  Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 100 });
  return { anchorRef: { current: anchor }, panelRef: { current: panel } };
}

describe('useAnchoredPosition', () => {
  it('returns nothing while closed', () => {
    const { anchorRef, panelRef } = refs();
    const { result } = renderHook(() => useAnchoredPosition({
      anchorRef, panelRef, open: false, onClose: () => {}, prefer: 'below', align: 'end', follow: 'close',
    }));
    expect(result.current).toBeNull();
  });

  it('measures on open', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const { anchorRef, panelRef } = refs();
    const { result } = renderHook(() => useAnchoredPosition({
      anchorRef, panelRef, open: true, onClose: () => {}, prefer: 'below', align: 'end', follow: 'track',
    }));
    expect(result.current).toEqual({ top: 136, left: 732, side: 'below' });
  });

  it('follow close calls onClose on resize', () => {
    const { anchorRef, panelRef } = refs();
    const onClose = vi.fn();
    renderHook(() => useAnchoredPosition({
      anchorRef, panelRef, open: true, onClose, prefer: 'below', align: 'end', follow: 'close',
    }));
    window.dispatchEvent(new Event('resize'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
