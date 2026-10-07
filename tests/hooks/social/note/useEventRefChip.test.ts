import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ preview: undefined as unknown }));
vi.mock('@/hooks/social/note/useNotePreview', () => ({ useNotePreview: () => mocks.preview }));
vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: (pubkey: string | null) => (pubkey ? { displayName: `name-of-${pubkey}` } : {}),
}));

import { useEventRefChip } from '@/hooks/social/note/useEventRefChip';

const ref = (author: string | null) => ({ type: 'event' as const, id: 'e'.repeat(64), relays: [], author, raw: 'nostr:x' });

describe('useEventRefChip', () => {
  it('names the author from the reference while the note loads', () => {
    mocks.preview = undefined;
    const { result } = renderHook(() => useEventRefChip(ref('alice')));
    expect(result.current).toMatchObject({ name: 'name-of-alice', loading: true, snippet: undefined });
  });

  it('takes the author and opening words from the fetched note', () => {
    mocks.preview = { pubkey: 'bob', content: ' gm\n\nall ' };
    const { result } = renderHook(() => useEventRefChip(ref(null)));
    expect(result.current).toMatchObject({ name: 'name-of-bob', loading: false, snippet: 'gm all' });
  });

  it('has no name when nobody has the note', () => {
    mocks.preview = null;
    const { result } = renderHook(() => useEventRefChip(ref(null)));
    expect(result.current).toMatchObject({ name: null, loading: false });
  });
});
