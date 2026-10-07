import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, renderHook } from '@testing-library/react';
import { useHintCallout } from '@/hooks/hints/useHintCallout';

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
