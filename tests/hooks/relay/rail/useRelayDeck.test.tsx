import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent, PointerEvent, MouseEvent } from 'react';
import { useRelayDeck } from '@/hooks/relay/rail/useRelayDeck';

const relays = ['wss://one.test', 'wss://two.test', 'wss://three.test'];

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const settle = () => act(() => vi.advanceTimersByTime(1000));

describe('useRelayDeck', () => {
  it('starts at the active relay and wraps in either direction', () => {
    const { result } = renderHook(() => useRelayDeck(relays, 'wss://three.test/'));
    expect(result.current.front).toBe(2);
    act(() => result.current.step(1));
    settle();
    expect(result.current.front).toBe(0);
    act(() => result.current.step(-1));
    settle();
    expect(result.current.front).toBe(2);
  });

  it('animates through fractional positions, including for a two-relay deck', () => {
    const { result } = renderHook(() => useRelayDeck(relays.slice(0, 2), relays[0]));
    act(() => result.current.step(1));
    act(() => vi.advanceTimersByTime(160));
    expect(result.current.position).toBeGreaterThan(0);
    expect(result.current.position).toBeLessThan(1);
    expect(result.current.settled).toBe(false);
    settle();
    expect(result.current.position).toBe(1);
    expect(result.current.settled).toBe(true);
  });

  it('focuses a rear card by the shortest rotation', () => {
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    act(() => result.current.focus(2));
    settle();
    expect(result.current.position).toBe(-1);
    expect(result.current.front).toBe(2);
  });

  it('supports keyboard navigation without switching relays', () => {
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    const preventDefault = vi.fn();
    act(() => result.current.onKeyDown({ key: 'End', preventDefault } as unknown as KeyboardEvent));
    settle();
    expect(result.current.front).toBe(2);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('follows a drag immediately, snaps a short swipe and suppresses its click', () => {
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    act(() => result.current.onPointerDown({ button: 0, clientY: 400, timeStamp: 0 } as PointerEvent<HTMLDivElement>));
    act(() => result.current.onPointerMove({ clientY: 350, pointerId: 1, timeStamp: 100, currentTarget: { setPointerCapture: vi.fn() } } as unknown as PointerEvent<HTMLDivElement>));
    expect(result.current.position).toBeCloseTo(50 / 300);
    act(() => result.current.onPointerUp({ clientY: 350, timeStamp: 120, type: 'pointerup' } as PointerEvent<HTMLDivElement>));
    settle();
    expect(result.current.front).toBe(1);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    act(() => result.current.onClickCapture({ preventDefault, stopPropagation } as unknown as MouseEvent));
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('honors reduced motion by switching cards immediately', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    act(() => result.current.step(1));
    expect(result.current.position).toBe(1);
    expect(result.current.settled).toBe(true);
  });

  it('cancels a drag back to its starting card', () => {
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    act(() => result.current.onPointerDown({ button: 0, clientY: 400, timeStamp: 0 } as PointerEvent<HTMLDivElement>));
    act(() => result.current.onPointerMove({ clientY: 100, pointerId: 1, timeStamp: 100, currentTarget: { setPointerCapture: vi.fn() } } as unknown as PointerEvent<HTMLDivElement>));
    act(() => result.current.onPointerUp({ clientY: 100, timeStamp: 120, type: 'pointercancel' } as PointerEvent<HTMLDivElement>));
    settle();
    expect(result.current.front).toBe(0);
  });
});
