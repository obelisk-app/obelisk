import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { findHintAnchor, hintTaughtBy, useHintHost } from '@/hooks/hints/useHintHost';
import { HINTS, hintsForSurface } from '@/utils/hints/registry';
import { useHintsStore } from '@/store/hints';

/** A laid-out element: jsdom has no layout, so offsetParent is stubbed. */
function mount(anchor: string, visible = true) {
  const el = document.createElement('button');
  el.setAttribute('data-tour', anchor);
  Object.defineProperty(el, 'offsetParent', { get: () => (visible ? document.body : null) });
  document.body.appendChild(el);
  return el;
}

beforeEach(() => { useHintsStore.getState().resetHints(); });
afterEach(() => { document.body.innerHTML = ''; });

describe('hint anchor helpers', () => {
  it('finds only an anchor that is laid out', () => {
    const el = mount('x-shown');
    mount('x-hidden', false);
    expect(findHintAnchor('x-shown')).toBe(el);
    expect(findHintAnchor('x-hidden')).toBeNull();
    expect(findHintAnchor('x-missing')).toBeNull();
  });

  it('names the hint a press inside an anchor teaches', () => {
    const hint = HINTS[0];
    const el = mount(hint.anchor);
    const inner = document.createElement('span');
    el.appendChild(inner);
    expect(hintTaughtBy(inner)).toBe(hint.id);
    expect(hintTaughtBy(document.body)).toBeUndefined();
  });
});

describe('useHintHost', () => {
  const surface = 'server' as const;
  const shell = 'desktop' as const;
  const first = hintsForSurface(surface, shell)[0];

  it('shows the first unseen hint whose anchor is on screen, and retires it on dismiss', () => {
    const el = mount(first.anchor);
    const { result } = renderHook(() => useHintHost(surface, shell));
    expect(result.current.hint?.id).toBe(first.id);
    expect(result.current.anchorEl).toBe(el);
    act(() => { result.current.dismiss(); });
    expect(useHintsStore.getState().seen).toContain(first.id);
    expect(result.current.hint?.id).not.toBe(first.id);
  });

  it('shows nothing without a surface or when muted', () => {
    mount(first.anchor);
    expect(renderHook(() => useHintHost(null, shell)).result.current.hint).toBeUndefined();
    act(() => { useHintsStore.getState().muteHints(); });
    expect(renderHook(() => useHintHost(surface, shell)).result.current.hint).toBeUndefined();
  });

  it('counts pressing a control as learning its hint', () => {
    const el = mount(first.anchor);
    renderHook(() => useHintHost(null, shell));
    act(() => { el.dispatchEvent(new Event('pointerdown', { bubbles: true })); });
    expect(useHintsStore.getState().seen).toContain(first.id);
  });
});
