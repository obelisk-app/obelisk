import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAppearancePreferencesRoot', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    delete document.documentElement.dataset.bubbleAnimation;
  });

  it('paints the page root now and again on every change', async () => {
    const { useAppearancePreferencesRoot } = await import('@/hooks/settings/appearance/useAppearancePreferencesRoot');
    const { setPreference } = await import('@/services/preferences/preferences');
    renderHook(() => useAppearancePreferencesRoot());
    expect(document.documentElement.dataset.bubbleAnimation).toBe('float');
    act(() => setPreference('bubbleAnimation', 'drift'));
    expect(document.documentElement.dataset.bubbleAnimation).toBe('drift');
  });
});
