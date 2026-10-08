import { render, renderHook, screen } from '@testing-library/react';
import { createRef, StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import TextArea from '@/components/ui/forms/TextArea';
import Input from '@/components/ui/forms/Input';
import { useForwardedRef } from '@/hooks/common/useForwardedRef';

describe('useForwardedRef', () => {
  it('feeds both its own ref and the caller\'s object ref', () => {
    const caller = createRef<HTMLInputElement>();
    const { result } = renderHook(() => useForwardedRef(caller));
    const node = document.createElement('input');
    result.current.setRef(node);
    expect(result.current.own.current).toBe(node);
    expect(caller.current).toBe(node);
  });

  it('feeds a callback ref, and keeps one callback while the ref is the same', () => {
    const caller = vi.fn();
    const { result, rerender } = renderHook(() => useForwardedRef(caller));
    const first = result.current.setRef;
    rerender();
    expect(result.current.setRef).toBe(first);
    const node = document.createElement('textarea');
    result.current.setRef(node);
    expect(caller).toHaveBeenCalledWith(node);
  });

  it('clears both refs on unmount and works with no forwarded ref', () => {
    const caller = createRef<HTMLInputElement>();
    const { result } = renderHook(() => useForwardedRef(caller));
    const node = document.createElement('input');
    result.current.setRef(node);
    result.current.setRef(null);
    expect(result.current.own.current).toBeNull();
    expect(caller.current).toBeNull();
    const bare = renderHook(() => useForwardedRef<HTMLInputElement>(undefined));
    bare.result.current.setRef(node);
    expect(bare.result.current.own.current).toBe(node);
  });
});

it('runs caller cleanup once when a mounted control changes refs or unmounts', () => {
  const firstCleanup = vi.fn();
  const secondCleanup = vi.fn();
  const first = vi.fn(() => firstCleanup);
  const second = vi.fn(() => secondCleanup);
  const { rerender, unmount } = render(<Input ref={first} data-testid="control" />);
  const node = screen.getByTestId('control');
  expect(first).toHaveBeenCalledWith(node);
  rerender(<Input ref={second} data-testid="control" />);
  expect(firstCleanup).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledWith(node);
  unmount();
  expect(firstCleanup).toHaveBeenCalledTimes(1);
  expect(secondCleanup).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
});

it('clears its internal handle and object refs during a real detach', () => {
  const caller = createRef<HTMLInputElement>();
  const replacement = createRef<HTMLInputElement>();
  const hook = renderHook(({ ref }) => useForwardedRef(ref), { initialProps: { ref: caller } });
  const view = render(<input ref={hook.result.current.setRef} data-testid="control" />);
  const node = screen.getByTestId('control');
  expect(hook.result.current.own.current).toBe(node);
  hook.rerender({ ref: replacement });
  view.rerender(<input ref={hook.result.current.setRef} data-testid="control" />);
  expect(caller.current).toBeNull();
  expect(replacement.current).toBe(node);
  expect(hook.result.current.own.current).toBe(node);
  view.unmount();
  expect(hook.result.current.own.current).toBeNull();
  expect(replacement.current).toBeNull();
});

it('clears legacy callback refs on replacement and unmount', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = render(<Input ref={first} data-testid="control" />);
  const node = screen.getByTestId('control');
  rerender(<Input ref={second} data-testid="control" />);
  expect(first.mock.calls).toEqual([[node], [null]]);
  unmount();
  expect(second.mock.calls).toEqual([[node], [null]]);
});

it('balances textarea callback cleanup when StrictMode reattaches its ref', () => {
  const active = new Set<HTMLTextAreaElement>();
  const cleanups: ReturnType<typeof vi.fn>[] = [];
  const caller = vi.fn((node: HTMLTextAreaElement | null) => {
    if (!node) throw new Error('Cleanup refs should not receive null');
    active.add(node);
    const cleanup = vi.fn(() => { active.delete(node); });
    cleanups.push(cleanup);
    return cleanup;
  });
  const { unmount } = render(<StrictMode><TextArea ref={caller} data-testid="control" /></StrictMode>);
  expect(active).toEqual(new Set([screen.getByTestId('control')]));
  unmount();
  expect(active.size).toBe(0);
  expect(cleanups.length).toBeGreaterThan(1);
  for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledTimes(1);
});
