import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import InfiniteSentinel from './InfiniteSentinel';

type Entry = { isIntersecting: boolean };
let callbacks: Array<(entries: Entry[]) => void> = [];
let observed = 0;
let disconnected = 0;

beforeEach(() => {
  callbacks = [];
  observed = 0;
  disconnected = 0;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: Entry[]) => void) { callbacks.push(callback); }
    observe() { observed += 1; }
    disconnect() { disconnected += 1; }
    unobserve() {}
    takeRecords() { return []; }
    root = null;
    rootMargin = '';
    thresholds = [];
  });
});

describe('InfiniteSentinel', () => {
  it('pages when it comes into range', () => {
    const onReach = vi.fn();
    render(<InfiniteSentinel onReach={onReach} />);
    expect(observed).toBe(1);

    callbacks[0]([{ isIntersecting: true }]);
    expect(onReach).toHaveBeenCalled();
  });

  it('does nothing while off screen', () => {
    const onReach = vi.fn();
    render(<InfiniteSentinel onReach={onReach} />);
    callbacks[0]([{ isIntersecting: false }]);
    expect(onReach).not.toHaveBeenCalled();
  });

  it('does not observe at all when disabled', () => {
    // Exhausted, or a page already in flight.
    render(<InfiniteSentinel onReach={vi.fn()} disabled />);
    expect(observed).toBe(0);
  });

  it('calls the latest handler, not the one it mounted with', () => {
    // The handler closes over the current page; a stale one re-fetches the
    // page the reader already has.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<InfiniteSentinel onReach={first} />);
    rerender(<InfiniteSentinel onReach={second} />);

    callbacks[0]([{ isIntersecting: true }]);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it('re-observing on enable does not leak the old observer', () => {
    const { rerender } = render(<InfiniteSentinel onReach={vi.fn()} />);
    rerender(<InfiniteSentinel onReach={vi.fn()} disabled />);
    expect(disconnected).toBe(1);
  });
});
