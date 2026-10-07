import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { HINT_CARD_WIDTH, placeHintCard, useHintCallout } from '@/hooks/hints/useHintCallout';

const viewport = { width: 1000, height: 800 };

describe('placeHintCard', () => {
  it('goes below the anchor, centred on it, when it fits', () => {
    const p = placeHintCard({ top: 100, bottom: 120, left: 400, width: 100 }, 80, viewport);
    expect(p).toEqual({ top: 130, left: 450 - HINT_CARD_WIDTH / 2, below: true });
  });

  it('flips above when there is no room below', () => {
    const p = placeHintCard({ top: 700, bottom: 720, left: 400, width: 100 }, 120, viewport);
    expect(p.below).toBe(false);
    expect(p.top).toBe(700 - 120 - 10);
  });

  it('clamps to the viewport edges', () => {
    expect(placeHintCard({ top: 10, bottom: 20, left: 0, width: 10 }, 40, viewport).left).toBe(8);
    expect(placeHintCard({ top: 10, bottom: 20, left: 990, width: 10 }, 40, viewport).left).toBe(1000 - HINT_CARD_WIDTH - 8);
    expect(placeHintCard({ top: 5, bottom: 790, left: 0, width: 10 }, 40, viewport).top).toBe(8);
  });
});

describe('useHintCallout', () => {
  const anchor = () => {
    const el = document.createElement('button');
    el.getBoundingClientRect = () => ({ top: 100, bottom: 120, left: 400, width: 100 }) as DOMRect;
    return el;
  };

  it('measures on mount and again on scroll', () => {
    const el = anchor();
    const { result } = renderHook(() => useHintCallout(el, 't', 'b', () => {}));
    expect(result.current.pos).toMatchObject({ top: 130, below: true });
    expect(result.current.canPortal).toBe(true);
    el.getBoundingClientRect = () => ({ top: 200, bottom: 220, left: 400, width: 100 }) as DOMRect;
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(result.current.pos?.top).toBe(230);
  });

  it('dismisses on Escape', () => {
    const onDismiss = vi.fn();
    const el = anchor();
    renderHook(() => useHintCallout(el, 't', 'b', onDismiss));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalled();
  });
});
