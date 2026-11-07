import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { KeyboardEvent, PointerEvent, MouseEvent } from 'react';
import { useRelayDeck } from '@/hooks/relay/rail/useRelayDeck';

const relays = ['wss://one.test', 'wss://two.test', 'wss://three.test'];

describe('useRelayDeck', () => {
  it('starts at the active relay and wraps in either direction', () => {
    const { result } = renderHook(() => useRelayDeck(relays, 'wss://three.test/'));
    expect(result.current.front).toBe(2);
    act(() => result.current.step(1));
    expect(result.current.front).toBe(0);
    act(() => result.current.step(-1));
    expect(result.current.front).toBe(2);
  });

  it('focuses a rear card by the shortest rotation', () => {
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    act(() => result.current.focus(2));
    expect(result.current.position).toBe(-1);
    expect(result.current.front).toBe(2);
  });

  it('supports keyboard navigation without switching relays', () => {
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    const preventDefault = vi.fn();
    act(() => result.current.onKeyDown({ key: 'End', preventDefault } as unknown as KeyboardEvent));
    expect(result.current.front).toBe(2);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('snaps a drag and suppresses the click that ends it', () => {
    const { result } = renderHook(() => useRelayDeck(relays, relays[0]));
    act(() => result.current.onPointerDown({ button: 0, clientY: 400 } as PointerEvent<HTMLDivElement>));
    act(() => result.current.onPointerMove({ clientY: 100, pointerId: 1, currentTarget: { setPointerCapture: vi.fn() } } as unknown as PointerEvent<HTMLDivElement>));
    act(() => result.current.onPointerUp());
    expect(result.current.front).toBe(1);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    act(() => result.current.onClickCapture({ preventDefault, stopPropagation } as unknown as MouseEvent));
    expect(stopPropagation).toHaveBeenCalled();
  });
});
