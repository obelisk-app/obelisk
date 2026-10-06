import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { NoteEntry } from '@nostr-wot/data';

const sdk = vi.hoisted(() => ({
  notes: new Map<string, unknown>(),
  thread: [] as unknown[],
}));
vi.mock('@nostr-wot/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nostr-wot/data')>()),
  fetchNote: async (id: string) => sdk.notes.get(id) ?? null,
  fetchThread: async () => sdk.thread,
}));

import { toEvent, useNoteThread } from '@/components/social/useNoteThread';

const entry = (id: string, tags: string[][] = []): NoteEntry => ({
  id, pubkey: 'p'.repeat(64), content: id, createdAt: 1, tags,
} as unknown as NoteEntry);

beforeEach(() => {
  sdk.notes.clear();
  sdk.thread = [];
});

describe('toEvent', () => {
  it('turns an SDK entry into a kind 1 event', () => {
    expect(toEvent(entry('x'))).toMatchObject({ id: 'x', kind: 1, created_at: 1, sig: '' });
  });
});

describe('useNoteThread', () => {
  it('loads the note, its parent chain oldest first, and its replies', async () => {
    sdk.notes.set('root', entry('root'));
    sdk.notes.set('mid', entry('mid', [['e', 'root', '', 'reply']]));
    sdk.notes.set('leaf', entry('leaf', [['e', 'mid', '', 'reply']]));
    sdk.thread = [entry('leaf'), entry('r1')];
    const { result } = renderHook(() => useNoteThread('leaf'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.root?.id).toBe('leaf');
    await waitFor(() => expect(result.current.ancestors.map((n) => n.id)).toEqual(['root', 'mid']));
    expect(result.current.replies.map((n) => n.id)).toEqual(['r1']);
  });

  it('reports a note it cannot find', async () => {
    const { result } = renderHook(() => useNoteThread('missing'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
  });

  it('shows a reply the reader just published', async () => {
    sdk.notes.set('n', entry('n'));
    const { result } = renderHook(() => useNoteThread('n'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.addReply({ id: 'mine' } as NostrEvent));
    expect(result.current.replies.map((n) => n.id)).toContain('mine');
  });
});
