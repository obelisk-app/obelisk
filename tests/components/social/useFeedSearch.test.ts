import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const mocks = vi.hoisted(() => ({
  searchNotes: vi.fn(),
  searchHashtag: vi.fn(),
  ensureSocialProfiles: vi.fn(),
}));

vi.mock('@/services/social/search', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/search')>()),
  searchNotes: mocks.searchNotes,
  searchHashtag: mocks.searchHashtag,
}));
vi.mock('@/services/social/profiles', () => ({ ensureSocialProfiles: mocks.ensureSocialProfiles }));
vi.mock('@/hooks/useNostrUserSearch', () => ({
  useNostrUserSearch: () => ({ directHit: null, nip05Hit: null, nostrResults: [], loading: false }),
}));

import { useFeedSearch } from '@/components/social/useFeedSearch';

const note = (id: string): NostrEvent => ({ id, pubkey: 'p'.repeat(64), kind: 1, content: `#tag ${id}`, tags: [['t', 'tag']], created_at: 1, sig: '' });

beforeEach(() => {
  vi.useFakeTimers();
  mocks.searchNotes.mockReset().mockResolvedValue([note('n1')]);
  mocks.searchHashtag.mockReset().mockResolvedValue([note('h1')]);
  mocks.ensureSocialProfiles.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('useFeedSearch', () => {
  it('is idle for an empty box', () => {
    const { result } = renderHook(() => useFeedSearch(''));
    expect(result.current.notes).toEqual([]);
    expect(result.current.busy).toBe(false);
    expect(result.current.empty).toBe(false);
  });

  it('searches the seeded query at once and names the authors', async () => {
    const { result } = renderHook(() => useFeedSearch('#nostr'));
    await act(async () => { await Promise.resolve(); });
    expect(mocks.searchHashtag).toHaveBeenCalledWith('nostr');
    expect(result.current.notes.map((n) => n.id)).toEqual(['h1']);
    expect(mocks.ensureSocialProfiles).toHaveBeenCalled();
  });

  it('waits for the typing to settle before searching', async () => {
    const { result } = renderHook(() => useFeedSearch(''));
    act(() => result.current.setRaw('bitcoin'));
    expect(mocks.searchNotes).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(300); await Promise.resolve(); });
    expect(mocks.searchNotes).toHaveBeenCalledWith('bitcoin');
  });
});
