import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { useNoteContent } from '@/hooks/social/note/useNoteContent';

function clickOnLink(href: string, mods: Partial<MouseEvent> = {}) {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  const preventDefault = vi.fn();
  return { event: { target: a, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, preventDefault, ...mods } as never, preventDefault };
}

describe('useNoteContent', () => {
  it('takes the fast path for a note with no references', () => {
    const { result } = renderHook(() => useNoteContent({ content: 'just text #tag' }));
    expect(result.current.plain).toBe(true);
    expect(result.current.onClick).toBeUndefined();
  });

  it('splits around a reference', () => {
    const npub = nip19.npubEncode('a'.repeat(64));
    const { result } = renderHook(() => useNoteContent({ content: `hi nostr:${npub}` }));
    expect(result.current.plain).toBe(false);
    expect(result.current.tokens.map((t) => t.kind)).toEqual(['text', 'ref']);
  });

  it('opens a hashtag link in-app, decoded', () => {
    const onOpenTag = vi.fn();
    const { result } = renderHook(() => useNoteContent({ content: 'x', onOpenTag }));
    const { event, preventDefault } = clickOnLink('/t/caf%C3%A9');
    result.current.onClick!(event);
    expect(preventDefault).toHaveBeenCalled();
    expect(onOpenTag).toHaveBeenCalledWith('café');
  });

  it('leaves modified clicks and other links to the browser', () => {
    const onOpenTag = vi.fn();
    const { result } = renderHook(() => useNoteContent({ content: 'x', onOpenTag }));
    const modified = clickOnLink('/t/x', { metaKey: true });
    result.current.onClick!(modified.event);
    const other = clickOnLink('https://example.com');
    result.current.onClick!(other.event);
    expect(onOpenTag).not.toHaveBeenCalled();
    expect(modified.preventDefault).not.toHaveBeenCalled();
  });
});
