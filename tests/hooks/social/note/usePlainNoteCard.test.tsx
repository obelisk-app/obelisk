import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

vi.mock('@/hooks/social/note/useNoteEngagement', () => ({ useNoteEngagement: () => ({ counts: {} }) }));
vi.mock('@/hooks/social/profile/useSocialProfile', () => ({ useSocialProfile: () => null }));

import { usePlainNoteCard } from '@/hooks/social/note/usePlainNoteCard';

const ME = 'a'.repeat(64);
const THEM = 'b'.repeat(64);
const note = (patch: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'n'.repeat(64), pubkey: THEM, kind: 1, content: 'hi', created_at: 1, sig: '', tags: [], ...patch,
});
const contacts = { id: 'c', pubkey: ME, kind: 3, created_at: 1, sig: '', content: '', tags: [['p', THEM]] };

describe('usePlainNoteCard', () => {
  it('knows whose note it is and whether the reader follows them', () => {
    const wrapper = bridgeWrapper(fakeBridge({ myPubkey: ME, myContactList: contacts }));
    const { result } = renderHook(() => usePlainNoteCard({ note: note(), quoted: false, nested: false }), { wrapper });
    expect(result.current).toMatchObject({ isMine: false, isFollowed: true, canInteract: true, mode: 'note' });
  });

  it('cannot interact signed out', () => {
    const wrapper = bridgeWrapper(fakeBridge({ myPubkey: null }));
    const { result } = renderHook(() => usePlainNoteCard({ note: note(), quoted: false, nested: false }), { wrapper });
    expect(result.current.canInteract).toBe(false);
  });

  it('hides a sensitive note until revealed', () => {
    const wrapper = bridgeWrapper(fakeBridge());
    const { result } = renderHook(() => usePlainNoteCard({
      note: note({ tags: [['content-warning', 'spoilers']] }), quoted: false, nested: false,
    }), { wrapper });
    expect(result.current.hidden).toBe(true);
    expect(result.current.warning.reason).toBe('spoilers');
    act(() => result.current.reveal());
    expect(result.current.hidden).toBe(false);
  });

  it('opens the thread from the body, except when quoted or nested', () => {
    const wrapper = bridgeWrapper(fakeBridge());
    const onOpenNote = vi.fn();
    const full = renderHook(() => usePlainNoteCard({ note: note(), quoted: false, nested: false, onOpenNote }), { wrapper });
    full.result.current.openThread!({ target: document.createElement('div') } as never);
    expect(onOpenNote).toHaveBeenCalledWith('n'.repeat(64));
    expect(renderHook(() => usePlainNoteCard({ note: note(), quoted: true, nested: false, onOpenNote }), { wrapper }).result.current.openThread).toBeUndefined();
    expect(renderHook(() => usePlainNoteCard({ note: note(), quoted: false, nested: true, onOpenNote }), { wrapper }).result.current.openThread).toBeUndefined();
  });

  it('finds the reply it answers', () => {
    const wrapper = bridgeWrapper(fakeBridge());
    const parent = 'f'.repeat(64);
    const { result } = renderHook(() => usePlainNoteCard({
      note: note({ tags: [['e', parent, '', 'reply']] }), quoted: false, nested: false,
    }), { wrapper });
    expect(result.current.replyParent?.id).toBe(parent);
  });
});
