import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

const mocks = vi.hoisted(() => ({
  publishReaction: vi.fn(),
  publishRepost: vi.fn(),
  bumpCounts: vi.fn(),
  pushToast: vi.fn(),
  listeners: new Map<string, (value: unknown) => void>(),
}));

vi.mock('@/services/social/publish', () => ({
  publishReaction: mocks.publishReaction,
  publishRepost: mocks.publishRepost,
}));

vi.mock('@/services/social/engagement', () => ({
  getCounts: () => ({ reactionCount: 1, repostCount: 2, zapTotalSats: 0, replyCount: 3 }),
  subscribeCounts: (id: string, cb: (value: unknown) => void) => {
    mocks.listeners.set(id, cb);
    return () => mocks.listeners.delete(id);
  },
  bumpCounts: mocks.bumpCounts,
}));

vi.mock('@/store/toast', () => ({
  useToastStore: { getState: () => ({ pushToast: mocks.pushToast }) },
}));

import { useNoteEngagement } from '@/components/social/note-card/useNoteEngagement';

const NOTE = { id: 'a'.repeat(64), pubkey: 'b'.repeat(64), kind: 1, content: 'hi', tags: [], created_at: 1, sig: '' } as NostrEvent;

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

beforeEach(() => {
  mocks.publishReaction.mockReset().mockResolvedValue({});
  mocks.publishRepost.mockReset().mockResolvedValue({});
  mocks.bumpCounts.mockReset();
  mocks.pushToast.mockReset();
  mocks.listeners.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe('useNoteEngagement', () => {
  it('starts from the cached counts and follows live updates', () => {
    const { result } = renderHook(() => useNoteEngagement(NOTE, true), { wrapper });
    expect(result.current.counts.replyCount).toBe(3);
    act(() => mocks.listeners.get(NOTE.id)!({ reactionCount: 9, repostCount: 0, zapTotalSats: 0, replyCount: 0 }));
    expect(result.current.counts.reactionCount).toBe(9);
  });

  it('likes once and bumps the count', async () => {
    const { result } = renderHook(() => useNoteEngagement(NOTE, true), { wrapper });
    await act(() => result.current.react());
    await act(() => result.current.react());
    expect(mocks.publishReaction).toHaveBeenCalledTimes(1);
    expect(mocks.bumpCounts).toHaveBeenCalledWith(NOTE.id, { reactionCount: 1 });
    expect(result.current.reacted).toBe(true);
  });

  it('reposts once and bumps the count', async () => {
    const { result } = renderHook(() => useNoteEngagement(NOTE, true), { wrapper });
    await act(() => result.current.repost());
    await act(() => result.current.repost());
    expect(mocks.publishRepost).toHaveBeenCalledTimes(1);
    expect(mocks.bumpCounts).toHaveBeenCalledWith(NOTE.id, { repostCount: 1 });
    expect(result.current.reposted).toBe(true);
  });

  it('does nothing for a signed-out reader', async () => {
    const { result } = renderHook(() => useNoteEngagement(NOTE, false), { wrapper });
    await act(() => result.current.react());
    await act(() => result.current.repost());
    expect(mocks.publishReaction).not.toHaveBeenCalled();
    expect(mocks.publishRepost).not.toHaveBeenCalled();
  });

  it('toasts a failed publish and leaves the action available', async () => {
    mocks.publishReaction.mockRejectedValueOnce(new Error('relay said no'));
    const { result } = renderHook(() => useNoteEngagement(NOTE, true), { wrapper });
    await act(() => result.current.react());
    expect(mocks.pushToast).toHaveBeenCalledTimes(1);
    expect(result.current.reacted).toBe(false);
    expect(result.current.busy).toBe(false);
  });

  it('copies an Obelisk link when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { result } = renderHook(() => useNoteEngagement(NOTE, true), { wrapper });
    await act(() => result.current.share());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0][0])).toContain('/notes/');
    expect(mocks.pushToast).toHaveBeenCalledTimes(1);
  });
});
