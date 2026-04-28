import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFaviconBadge } from './useFaviconBadge';
import { useNotificationStore } from '@/store/notification';

// Spy on the favicon-badge module so we can assert what totals the hook
// pushes down without exercising the canvas path (that's covered by the
// favicon-badge unit tests).
vi.mock('@/lib/favicon-badge', () => ({
  setBadgeCount: vi.fn(() => Promise.resolve()),
  clearBadge: vi.fn(() => Promise.resolve()),
}));

// Late-import the mocked module to read its spies.
import * as faviconBadge from '@/lib/favicon-badge';

describe('useFaviconBadge', () => {
  const originalTitle = 'Obelisk';

  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState());
    document.title = originalTitle;
    (faviconBadge.setBadgeCount as any).mockClear();
    (faviconBadge.clearBadge as any).mockClear();
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it('keeps base title and calls clearBadge when nothing is unread', () => {
    renderHook(() => useFaviconBadge());
    expect(document.title).toBe(originalTitle);
    expect(faviconBadge.clearBadge).toHaveBeenCalled();
  });

  it('sums all channel unreads (mention or not)', () => {
    useNotificationStore.getState().setBulkUnreads({
      channels: { ch1: 5, ch2: 3 },
      dms: {},
      mentionChannels: { ch1: true },
    });

    renderHook(() => useFaviconBadge());

    expect(faviconBadge.setBadgeCount).toHaveBeenCalledWith(8);
    expect(document.title).toBe(`(8) ${originalTitle}`);
  });

  it('sums channel unreads + DM unreads', () => {
    useNotificationStore.getState().setBulkUnreads({
      channels: { ch1: 2 },
      dms: { alice: 3, bob: 4 },
      mentionChannels: { ch1: true },
    });

    renderHook(() => useFaviconBadge());

    // 2 from ch1 + 3 alice + 4 bob = 9
    expect(faviconBadge.setBadgeCount).toHaveBeenCalledWith(9);
    expect(document.title).toBe(`(9) ${originalTitle}`);
  });

  it('reacts to store changes after mount', () => {
    renderHook(() => useFaviconBadge());
    expect(document.title).toBe(originalTitle);

    act(() => {
      useNotificationStore.getState().setDMUnread('alice', 2);
    });

    expect(document.title).toBe(`(2) ${originalTitle}`);
    expect(faviconBadge.setBadgeCount).toHaveBeenLastCalledWith(2);
  });

  it('shows 99+ for totals over 99', () => {
    useNotificationStore.getState().setBulkUnreads({
      channels: {},
      dms: { spammer: 150 },
      mentionChannels: {},
    });

    renderHook(() => useFaviconBadge());

    expect(document.title).toBe(`(99+) ${originalTitle}`);
    expect(faviconBadge.setBadgeCount).toHaveBeenCalledWith(150);
  });

  it('strips a pre-badged title when capturing the base title', () => {
    // Simulate a remount or second hook instance where document.title was
    // already "(7) Obelisk" from a prior render. The hook should fall back
    // to the base "Obelisk" so unmount/restore won't freeze a stale count.
    document.title = '(7) Obelisk';
    const { unmount } = renderHook(() => useFaviconBadge());

    // Before unmount: computeTotal() is 0 (empty store) so title is reset.
    expect(document.title).toBe(originalTitle);

    unmount();
    expect(document.title).toBe(originalTitle);
  });

  it('restores base title and clears badge on unmount', () => {
    useNotificationStore.getState().setDMUnread('alice', 3);
    const { unmount } = renderHook(() => useFaviconBadge());
    expect(document.title).toBe(`(3) ${originalTitle}`);

    unmount();

    expect(document.title).toBe(originalTitle);
    // clearBadge is called both for the count=0 branch AND in cleanup.
    expect(faviconBadge.clearBadge).toHaveBeenCalled();
  });
});
