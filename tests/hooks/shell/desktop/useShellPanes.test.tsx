import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { useExploredProfile, useReaderPane } from '@/hooks/shell/desktop/useShellPanes';

const article = { id: 'a1', kind: 30023 } as NostrEvent;

// The pane closes from `popstate`, the way the OS back gesture does; make the
// UI's `history.back()` deliver it synchronously.
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(window.history, 'back').mockImplementation(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
});

describe('useReaderPane', () => {
  it('stacks threads, and back returns one level at a time', () => {
    const { result } = renderHook(() => useReaderPane());
    act(() => result.current.openThread('t1'));
    act(() => result.current.pushThread('t2'));
    expect(result.current.threadNoteId).toBe('t2');
    act(() => result.current.dismissPane());
    expect(result.current.threadNoteId).toBe('t1');
    expect(result.current.paneOpen).toBe(true);
  });

  it('does not stack the same note twice', () => {
    const { result } = renderHook(() => useReaderPane());
    act(() => result.current.openThread('t1'));
    act(() => result.current.pushThread('t1'));
    act(() => result.current.dismissPane());
    expect(result.current.paneOpen).toBe(false);
  });

  it('holds one thing: an article clears the thread stack, a thread clears the article', () => {
    const { result } = renderHook(() => useReaderPane());
    act(() => result.current.openThread('t1'));
    act(() => result.current.openArticle(article));
    expect(result.current.threadNoteId).toBeNull();
    expect(result.current.paneArticle).toBe(article);
    act(() => result.current.openThread('t2'));
    expect(result.current.paneArticle).toBeNull();
    expect(result.current.threadNoteId).toBe('t2');
  });

  it('leaving the pane also leaves full-screen', () => {
    const { result } = renderHook(() => useReaderPane());
    act(() => result.current.openArticle(article));
    act(() => result.current.setPaneFull(true));
    act(() => result.current.dismissPane());
    expect(result.current.paneOpen).toBe(false);
    expect(result.current.paneFull).toBe(false);
  });
});

describe('useExploredProfile', () => {
  it('closing clears the profile and its full-screen flag', () => {
    const { result } = renderHook(() => useExploredProfile());
    act(() => result.current.setExploredProfilePubkey('pk'));
    act(() => result.current.setProfileFull(true));
    act(() => result.current.closeProfile());
    expect(result.current.exploredProfilePubkey).toBeNull();
    expect(result.current.profileFull).toBe(false);
  });
});
