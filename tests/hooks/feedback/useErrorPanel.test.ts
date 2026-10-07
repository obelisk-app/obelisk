import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useErrorPanel } from '@/hooks/feedback/useErrorPanel';

afterEach(() => {
  document.documentElement.lang = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useErrorPanel', () => {
  it('logs the error, translates in the page language and counts what it cleared', () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    document.documentElement.lang = 'es';
    localStorage.setItem('obelisk-cache-v4/x/1/a', '1');
    const error = new Error('boom');
    const { result } = renderHook(() => useErrorPanel(error));
    expect(log).toHaveBeenCalledWith('[obelisk] render error boundary caught:', error);
    expect(result.current.t('panel.reload')).not.toBe('panel.reload');
    expect(result.current.clearedCount).toBeNull();
    act(() => { result.current.clearCache(); });
    expect(result.current.clearedCount).toBeGreaterThanOrEqual(0);
  });
});
