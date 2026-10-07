import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { NoteEngagement } from '@/hooks/social/note/useNoteEngagement';
import { useNoteActionRow } from '@/hooks/social/note/useNoteActionRow';

const NOTE = { id: 'n1', pubkey: 'p', kind: 1, content: '', created_at: 1, sig: '', tags: [] } as NostrEvent;
const engagement = () => ({
  react: vi.fn().mockResolvedValue(undefined),
  repost: vi.fn().mockResolvedValue(undefined),
  share: vi.fn().mockResolvedValue(undefined),
}) as unknown as NoteEngagement;

describe('useNoteActionRow', () => {
  it('opens the thread on reply when the host has one, else composes', () => {
    const onOpenNote = vi.fn();
    const onReply = vi.fn();
    const e = engagement();
    const withThread = renderHook(() => useNoteActionRow({ note: NOTE, engagement: e, onOpenNote, onReply }));
    withThread.result.current.reply();
    expect(onOpenNote).toHaveBeenCalledWith('n1');
    expect(onReply).not.toHaveBeenCalled();
    const composeOnly = renderHook(() => useNoteActionRow({ note: NOTE, engagement: e, onReply }));
    composeOnly.result.current.reply();
    expect(onReply).toHaveBeenCalledWith(NOTE);
  });

  it('offers quote only when the host can compose one', () => {
    const e = engagement();
    expect(renderHook(() => useNoteActionRow({ note: NOTE, engagement: e })).result.current.quote).toBeUndefined();
    const onQuote = vi.fn();
    renderHook(() => useNoteActionRow({ note: NOTE, engagement: e, onQuote })).result.current.quote!();
    expect(onQuote).toHaveBeenCalledWith(NOTE);
  });

  it('passes repost, react, share and zap through', () => {
    const e = engagement();
    const onZap = vi.fn();
    const { result } = renderHook(() => useNoteActionRow({ note: NOTE, engagement: e, onZap }));
    result.current.repost();
    result.current.react();
    result.current.share();
    result.current.zap();
    expect(e.repost).toHaveBeenCalled();
    expect(e.react).toHaveBeenCalled();
    expect(e.share).toHaveBeenCalled();
    expect(onZap).toHaveBeenCalledWith(NOTE);
  });
});
