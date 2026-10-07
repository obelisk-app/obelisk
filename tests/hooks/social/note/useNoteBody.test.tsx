import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { LONG_NOTE_CHARS } from '@/utils/social/note-card';
import { useNoteBody } from '@/hooks/social/note/useNoteBody';

const note = (patch: Partial<NostrEvent>): NostrEvent => ({
  id: 'n', pubkey: 'p', kind: 1, content: '', created_at: 1, sig: '', tags: [], ...patch,
});
const wrapper = bridgeWrapper(fakeBridge());

describe('useNoteBody', () => {
  it('clamps a long note until expanded', () => {
    const { result } = renderHook(() => useNoteBody({ note: note({ content: 'x'.repeat(LONG_NOTE_CHARS + 1) }), mode: 'note' }), { wrapper });
    expect(result.current).toMatchObject({ isLong: true, clamped: true, expanded: false });
    act(() => result.current.toggleExpanded());
    expect(result.current).toMatchObject({ clamped: false, expanded: true });
  });

  it('leaves a short note alone', () => {
    const { result } = renderHook(() => useNoteBody({ note: note({ content: 'hi' }), mode: 'note' }), { wrapper });
    expect(result.current).toMatchObject({ isLong: false, clamped: false, groupHref: null });
  });

  it('reads a highlight source and a file url and type from tags', () => {
    const { result } = renderHook(() => useNoteBody({
      note: note({ tags: [['r', 'https://src'], ['url', 'https://f/x.png'], ['m', 'image/png']] }),
      mode: 'file',
    }), { wrapper });
    expect(result.current).toMatchObject({ highlightSource: 'https://src', fileUrl: 'https://f/x.png', fileMimeType: 'image/png' });
  });

  it('has no file type when none was tagged', () => {
    const { result } = renderHook(() => useNoteBody({ note: note({}), mode: 'file' }), { wrapper });
    expect(result.current.fileMimeType).toBeNull();
  });
});
