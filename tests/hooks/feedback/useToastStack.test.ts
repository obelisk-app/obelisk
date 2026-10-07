import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { TOAST_AUTO_DISMISS_MS, toastRemainingMs, useToastStack } from '@/hooks/feedback/useToastStack';
import { useToastStore } from '@/store/feedback/toast';

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clearToasts();
});
afterEach(() => { vi.useRealTimers(); });

describe('toastRemainingMs', () => {
  it('counts down from when the toast was pushed and never goes below zero', () => {
    expect(toastRemainingMs(1000, 1000)).toBe(TOAST_AUTO_DISMISS_MS);
    expect(toastRemainingMs(1000, 3000)).toBe(TOAST_AUTO_DISMISS_MS - 2000);
    expect(toastRemainingMs(0, TOAST_AUTO_DISMISS_MS * 3)).toBe(0);
  });
});

describe('useToastStack', () => {
  it('opens a toast by running its action and closing it', () => {
    const onClick = vi.fn();
    act(() => { useToastStore.getState().pushToast({ title: 'a', body: 'b', onClick }); });
    const { result } = renderHook(() => useToastStack());
    act(() => { result.current.open(result.current.toasts[0]); });
    expect(onClick).toHaveBeenCalledOnce();
    expect(result.current.toasts).toEqual([]);
  });

  it('dismisses from the icon without the click reaching the toast', () => {
    act(() => { useToastStore.getState().pushToast({ title: 'a', body: 'b' }); });
    const { result } = renderHook(() => useToastStack());
    const stopPropagation = vi.fn();
    act(() => { result.current.dismiss({ stopPropagation } as unknown as MouseEvent, result.current.toasts[0].id); });
    expect(stopPropagation).toHaveBeenCalled();
    expect(result.current.toasts).toEqual([]);
  });

  it('closes each toast on its own timer', () => {
    act(() => { useToastStore.getState().pushToast({ title: 'a', body: 'b' }); });
    const { result } = renderHook(() => useToastStack());
    act(() => { vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1); });
    expect(result.current.toasts).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.toasts).toEqual([]);
  });
});
