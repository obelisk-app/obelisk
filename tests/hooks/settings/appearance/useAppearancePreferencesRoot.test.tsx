import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useAppearancePreferencesRoot', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.bubbleAnimation;
  });
  afterEach(() => vi.restoreAllMocks());

  it('applies colors and updates animation without rewriting the palette', async () => {
    const { useAppearancePreferencesRoot } = await import('@/hooks/settings/appearance/useAppearancePreferencesRoot');
    const { setAppearancePreference } = await import('@/services/preferences/appearance');
    const writes = vi.spyOn(document.documentElement.style, 'setProperty');
    renderHook(() => useAppearancePreferencesRoot());
    expect(document.documentElement.style.getPropertyValue('--obelisk-accent')).toBe('#b4f953');
    expect(document.documentElement.dataset.bubbleAnimation).toBe('float');
    writes.mockClear();
    const { setPreference } = await import('@/services/preferences/preferences');
    act(() => setPreference('notificationSounds', false));
    act(() => setAppearancePreference('bubbleAnimation', 'drift'));
    expect(writes).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.bubbleAnimation).toBe('drift');
    act(() => setAppearancePreference('accentColor', '#7ec8ff'));
    expect(document.documentElement.style.getPropertyValue('--obelisk-accent')).toBe('#7ec8ff');
    expect(document.documentElement.style.getPropertyValue('--color-lc-green')).toBe('#7ec8ff');
  });
});
