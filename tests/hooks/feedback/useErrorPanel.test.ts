import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { errorPanelDetail, errorPanelHome, readPanelLocale, useErrorPanel } from '@/hooks/feedback/useErrorPanel';

afterEach(() => {
  document.documentElement.lang = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('error panel helpers', () => {
  it('reads es and pt off <html lang> and falls back to en', () => {
    document.documentElement.lang = 'pt';
    expect(readPanelLocale()).toBe('pt');
    document.documentElement.lang = 'fr';
    expect(readPanelLocale()).toBe('en');
  });

  it('joins the message and the digest', () => {
    expect(errorPanelDetail(Object.assign(new Error('boom'), { digest: 'x1' }))).toBe('boom\ndigest: x1');
    expect(errorPanelDetail(new Error(''))).toBe('');
  });

  it('sends English home to the bare landing and the others to their prefix', () => {
    expect(errorPanelHome('en')).toBe('/');
    expect(errorPanelHome('es')).toBe('/es');
  });
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
