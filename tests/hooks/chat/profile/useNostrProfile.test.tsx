import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

const feed = vi.hoisted(() => ({ setTab: vi.fn(), refresh: vi.fn() }));
vi.mock('@/hooks/chat/profile/useProfileMeta', () => ({ useProfileMeta: () => ({ name: 'ana' }) }));
vi.mock('@/hooks/chat/profile/useProfileFollow', () => ({ useProfileFollow: () => ({ isMe: true, following: false }) }));
vi.mock('@/hooks/chat/profile/useProfileFeed', () => ({
  useProfileFeed: () => ({ tab: 'replies', setTab: feed.setTab, state: { refresh: feed.refresh }, visibleNotes: [], media: [] }),
}));
vi.mock('@/hooks/preferences/usePreferences', () => ({ usePreferences: () => ({ socialRelays: [] }) }));

import { useNostrProfile } from '@/hooks/chat/profile/useNostrProfile';

const wrapper = ({ children }: { children: React.ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const note = { id: 'n1' } as NostrEvent;

describe('useNostrProfile', () => {
  beforeEach(() => { feed.setTab.mockClear(); feed.refresh.mockClear(); });

  it('names the profile from its kind 0 and reads isMe from following', () => {
    const { result } = renderHook(() => useNostrProfile('a'.repeat(64), null), { wrapper });
    expect(result.current.displayName).toBe('ana');
    expect(result.current.isMe).toBe(true);
  });

  it('a published note closes the composer, shows Posts and reloads', () => {
    const { result } = renderHook(() => useNostrProfile('a'.repeat(64), null), { wrapper });
    act(() => result.current.composeNote());
    expect(result.current.composer).toEqual({ kind: 'note' });
    act(() => result.current.notePublished());
    expect(result.current.composer).toBeNull();
    expect(feed.setTab).toHaveBeenCalledWith('posts');
    expect(feed.refresh).toHaveBeenCalledOnce();
  });

  it('a reply or quote keeps the tab; the reply and quote starters are stable', () => {
    const { result, rerender } = renderHook(() => useNostrProfile('a'.repeat(64), null), { wrapper });
    const { startReply, startQuote } = result.current;
    act(() => result.current.startQuote(note));
    expect(result.current.composer).toEqual({ kind: 'quote', target: note });
    act(() => result.current.replyPublished());
    expect(result.current.composer).toBeNull();
    expect(feed.setTab).not.toHaveBeenCalled();
    rerender();
    expect(result.current.startReply).toBe(startReply);
    expect(result.current.startQuote).toBe(startQuote);
  });

  it('opens and closes a thread, an article and a media item', () => {
    const { result } = renderHook(() => useNostrProfile('a'.repeat(64), null), { wrapper });
    act(() => result.current.setOpenNoteId('n1'));
    expect(result.current.openNoteId).toBe('n1');
    act(() => result.current.closeNote());
    act(() => result.current.handleOpenArticle(note));
    expect(result.current.openArticle).toBe(note);
    act(() => result.current.closeArticle());
    act(() => result.current.setExpandedMedia('u'));
    act(() => result.current.closeMedia());
    expect([result.current.openNoteId, result.current.openArticle, result.current.expandedMedia]).toEqual([null, null, null]);
  });
});
