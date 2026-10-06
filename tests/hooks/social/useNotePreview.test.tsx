/**
 * The "Replying to ..." line and the inline note chip ask for a preview by id.
 * When the same card is handed another id, it must not show the previous
 * note's text for the new one, not even for one render. It used to: the reset
 * ran in an effect after the switch.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotePreview } from '@/services/social/note-preview';

const t = vi.hoisted(() => ({
  cache: new Map<string, NotePreview | null>(),
  pending: new Map<string, (preview: NotePreview | null) => void>(),
  hints: [] as Array<readonly string[] | undefined>,
}));

vi.mock('@/services/social/note-preview', () => ({
  getCachedNotePreview: (id: string) => t.cache.get(id),
  loadNotePreview: (id: string, relays?: readonly string[]) => {
    t.hints.push(relays);
    return new Promise<NotePreview | null>((resolve) => {
      t.pending.set(id, (preview) => { t.cache.set(id, preview); resolve(preview); });
    });
  },
}));

import { useNotePreview } from '@/hooks/social/useNotePreview';

const note = (id: string, content: string): NotePreview => ({ id, pubkey: 'p', content });

beforeEach(() => {
  t.cache.clear();
  t.pending.clear();
  t.hints = [];
  t.cache.set('a', note('a', 'first note'));
});

describe('useNotePreview', () => {
  it("never shows the previous note's preview for the next id", () => {
    const seen: Array<[string | null, string | null | undefined]> = [];
    const { rerender } = renderHook(({ id }) => {
      const preview = useNotePreview(id);
      seen.push([id, preview === undefined ? undefined : preview?.content ?? null]);
    }, { initialProps: { id: 'a' as string | null } });
    expect(seen.at(-1)).toEqual(['a', 'first note']);

    rerender({ id: 'b' });
    expect(seen.filter(([id]) => id === 'b').map(([, c]) => c)).not.toContain('first note');
    rerender({ id: null });
    expect(seen.filter(([id]) => id === null).map(([, c]) => c)).not.toContain('first note');
  });

  it('is undefined while loading, then the note, or null once it is known to be gone', async () => {
    const { result, rerender } = renderHook(({ id }) => useNotePreview(id, ['wss://hint']), {
      initialProps: { id: 'b' },
    });
    expect(result.current).toBeUndefined();
    expect(t.hints).toEqual([['wss://hint']]);
    await act(async () => t.pending.get('b')?.(note('b', 'second note')));
    expect(result.current?.content).toBe('second note');

    rerender({ id: 'c' });
    expect(result.current).toBeUndefined();
    await act(async () => t.pending.get('c')?.(null));
    expect(result.current).toBeNull();

    rerender({ id: 'a' });
    expect(result.current?.content).toBe('first note');
  });
});
