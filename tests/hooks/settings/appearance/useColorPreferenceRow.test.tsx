import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('useColorPreferenceRow', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('keeps the draft, saves only a whole colour, and adopts a new saved value', async () => {
    const { useColorPreferenceRow } = await import('@/hooks/settings/appearance/useColorPreferenceRow');
    const { getPreferences } = await import('@/services/preferences/preferences');
    const { result, rerender } = renderHook(({ value }) => useColorPreferenceRow('accentColor', value), { initialProps: { value: '#b4f953' } });
    act(() => result.current.commit('#7E'));
    expect(result.current.draft).toBe('#7E');
    expect(getPreferences().accentColor).toBe('#b4f953');
    act(() => result.current.commit('#7EC8FF'));
    expect(getPreferences().accentColor).toBe('#7ec8ff');
    rerender({ value: '#000000' });
    expect(result.current.draft).toBe('#000000');
  });
});
