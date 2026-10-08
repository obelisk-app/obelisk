import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { useToastStack } from '@/hooks/feedback/useToastStack';
import { TOAST_AUTO_DISMISS_MS } from '@/constants/feedback/toast';
import { useToastStore } from '@/store/feedback/toast';

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clearToasts();
});
afterEach(() => { vi.useRealTimers(); });

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

  it('expires a short hint without shortening other feedback or restarting its clock', () => {
    const { result } = renderHook(() => useToastStack());
    act(() => { useToastStore.getState().pushToast({ title: 'Exit', body: '', durationMs: 2000 }); });
    act(() => { vi.advanceTimersByTime(1000); });
    act(() => { useToastStore.getState().pushToast({ title: 'Saved', body: '' }); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current.toasts.map((toast) => toast.title)).toEqual(['Saved']);
    act(() => { vi.advanceTimersByTime(4000); });
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
