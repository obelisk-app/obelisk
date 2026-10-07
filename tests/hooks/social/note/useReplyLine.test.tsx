import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const mocks = vi.hoisted(() => ({ preview: null as unknown, previewArgs: [] as unknown[] }));
vi.mock('@/hooks/social/note/useNotePreview', () => ({
  useNotePreview: (...args: unknown[]) => { mocks.previewArgs = args; return mocks.preview; },
}));
vi.mock('@/hooks/social/profile/useAuthor', () => ({
  useAuthor: (pubkey: string | null) => (pubkey ? { displayName: 'Alice' } : null),
}));

import { useReplyLine } from '@/hooks/social/note/useReplyLine';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const stop = () => ({ stopPropagation: vi.fn() }) as unknown as { stopPropagation: () => void };

describe('useReplyLine', () => {
  it('names the author from the tag without fetching the parent', () => {
    const { result } = renderHook(() => useReplyLine({ parent: { id: 'p1', author: 'alice', relay: null } as never }), { wrapper });
    expect(result.current.name).toBe('Alice');
    expect(mocks.previewArgs[0]).toBeNull();
  });

  it('fetches the parent from its relay when the tag left the author out', () => {
    mocks.preview = null;
    const { result } = renderHook(() => useReplyLine({ parent: { id: 'p1', author: null, relay: 'wss://r' } as never }), { wrapper });
    expect(mocks.previewArgs).toEqual(['p1', ['wss://r']]);
    expect(result.current.canOpenAuthor).toBe(false);
    expect(result.current.name).not.toBe('Alice');
  });

  it('opens the author and the parent without the click reaching the card', () => {
    const onOpenProfile = vi.fn();
    const onOpenNote = vi.fn();
    const { result } = renderHook(() => useReplyLine({ parent: { id: 'p1', author: 'alice', relay: null } as never, onOpenProfile, onOpenNote }), { wrapper });
    expect(result.current.canOpenAuthor).toBe(true);
    const a = stop();
    result.current.openAuthor(a as never);
    expect(a.stopPropagation).toHaveBeenCalled();
    expect(onOpenProfile).toHaveBeenCalledWith('alice');
    const b = stop();
    result.current.openParent(b as never);
    expect(b.stopPropagation).toHaveBeenCalled();
    expect(onOpenNote).toHaveBeenCalledWith('p1');
  });
});
