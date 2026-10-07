import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { useNoteImetaMedia } from '@/hooks/social/note/useNoteImetaMedia';

describe('useNoteImetaMedia', () => {
  it('lists the media from the imeta tags, once per note', () => {
    const note: NostrEvent = {
      id: 'n', pubkey: 'p', kind: 20, content: '', created_at: 1, sig: '',
      tags: [['imeta', 'url https://cdn/a.jpg', 'm image/jpeg', 'dim 4x3'], ['imeta', 'url https://cdn/b.jpg']],
    };
    const { result, rerender } = renderHook(() => useNoteImetaMedia(note));
    expect(result.current.media.map((m) => m.url)).toEqual(['https://cdn/a.jpg', 'https://cdn/b.jpg']);
    const first = result.current.media;
    rerender();
    expect(result.current.media).toBe(first);
  });
});
