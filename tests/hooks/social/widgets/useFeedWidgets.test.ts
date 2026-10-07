import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prefs: { feedWidgets: ['trending', 'who-to-follow'] as unknown },
  setPreference: vi.fn(),
}));

vi.mock('@/services/preferences/preferences', () => ({ setPreference: mocks.setPreference }));
vi.mock('@/hooks/preferences/usePreferences', () => ({ usePreferences: () => mocks.prefs }));

import { useFeedWidgets } from '@/hooks/social/widgets/useFeedWidgets';

beforeEach(() => {
  mocks.prefs.feedWidgets = ['trending', 'who-to-follow'];
  mocks.setPreference.mockReset();
});

describe('useFeedWidgets', () => {
  it('reads the picked widgets, dropping ids that no longer exist', () => {
    mocks.prefs.feedWidgets = ['relays', 'gone'];
    const { result } = renderHook(() => useFeedWidgets());
    expect(result.current.selected).toEqual(['relays']);
  });

  it('falls back to the defaults when nothing usable is stored', () => {
    mocks.prefs.feedWidgets = undefined;
    const { result } = renderHook(() => useFeedWidgets());
    expect(result.current.selected).toEqual(['trending', 'who-to-follow']);
  });

  it('offers one picker row per widget', () => {
    const { result } = renderHook(() => useFeedWidgets());
    expect(result.current.options).toHaveLength(4);
  });

  it('writes the toggled list to preferences', () => {
    const { result } = renderHook(() => useFeedWidgets());
    result.current.toggle('relays');
    expect(mocks.setPreference).toHaveBeenCalledWith('feedWidgets', ['trending', 'who-to-follow', 'relays']);
    result.current.toggle('trending');
    expect(mocks.setPreference).toHaveBeenLastCalledWith('feedWidgets', ['who-to-follow']);
  });
});
