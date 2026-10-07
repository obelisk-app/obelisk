import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrollReveal } from '@/hooks/marketing/useScrollReveal';

/** A controllable IntersectionObserver: the test decides when an element intersects. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed: Element[] = [];
  disconnected = false;
  constructor(readonly cb: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe(el: Element) { this.observed.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  takeRecords(): IntersectionObserverEntry[] { return []; }
  fire(isIntersecting: boolean) {
    const entry = { isIntersecting, target: this.observed[0] } as IntersectionObserverEntry;
    this.cb([entry], this as unknown as IntersectionObserver);
  }
}

/** Mounts the hook with its ref attached to a real element, as a component would. */
function renderAttached() {
  const el = document.createElement('section');
  return renderHook(() => {
    const [ref, visible] = useScrollReveal<HTMLElement>();
    ref.current = el;
    return { ref, visible };
  });
}

describe('useScrollReveal', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('starts hidden and observes the attached element at a 15% threshold', () => {
    const { result } = renderAttached();
    expect(result.current.visible).toBe(false);
    const [obs] = FakeIntersectionObserver.instances;
    expect(obs.observed).toEqual([result.current.ref.current]);
    expect(obs.options).toEqual({ threshold: 0.15 });
  });

  it('becomes visible on the first intersection, then stops observing and never goes back', () => {
    const { result } = renderAttached();
    const [obs] = FakeIntersectionObserver.instances;
    act(() => obs.fire(false));
    expect(result.current.visible).toBe(false);
    act(() => obs.fire(true));
    expect(result.current.visible).toBe(true);
    expect(obs.disconnected).toBe(true);
    act(() => obs.fire(false));
    expect(result.current.visible).toBe(true);
  });

  it('disconnects on unmount', () => {
    const { unmount } = renderAttached();
    const [obs] = FakeIntersectionObserver.instances;
    unmount();
    expect(obs.disconnected).toBe(true);
  });

  it('creates no observer when nothing is attached to the ref', () => {
    renderHook(() => useScrollReveal<HTMLElement>());
    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });
});
