import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const mocks = vi.hoisted(() => ({ inner: null as unknown, target: null as unknown }));
vi.mock('@/services/social/repost', () => ({
  embeddedRepostEvent: () => mocks.inner,
  repostTarget: () => mocks.target,
}));

import { useRepostCard } from '@/hooks/social/note/useRepostCard';

const WRAPPER = { id: 'w', pubkey: 'alice', kind: 6, content: '', created_at: 1, sig: '', tags: [] } as NostrEvent;
const click = () => ({ target: document.createElement('div') }) as never;

describe('useRepostCard', () => {
  it('lists the row author first, then the other reposters', () => {
    const { result } = renderHook(() => useRepostCard({ note: WRAPPER, reposters: ['bob', 'alice'] }));
    expect(result.current.everyone).toEqual(['alice', 'bob']);
  });

  it('opens the verified embed, else the e-tag target', () => {
    const onOpenNote = vi.fn();
    mocks.inner = { id: 'inner' };
    mocks.target = { id: 'target' };
    renderHook(() => useRepostCard({ note: WRAPPER, onOpenNote })).result.current.openReposted!(click());
    expect(onOpenNote).toHaveBeenLastCalledWith('inner');
    mocks.inner = null;
    renderHook(() => useRepostCard({ note: { ...WRAPPER, id: 'w2' }, onOpenNote })).result.current.openReposted!(click());
    expect(onOpenNote).toHaveBeenLastCalledWith('target');
  });

  it('has no row click with nothing to open or nowhere to open it', () => {
    mocks.inner = null;
    mocks.target = null;
    expect(renderHook(() => useRepostCard({ note: WRAPPER, onOpenNote: vi.fn() })).result.current.openReposted).toBeUndefined();
    mocks.target = { id: 't' };
    expect(renderHook(() => useRepostCard({ note: WRAPPER })).result.current.openReposted).toBeUndefined();
  });

  it('opens the target from the fallback button, and nothing without one', () => {
    const onOpenNote = vi.fn();
    mocks.inner = null;
    mocks.target = null;
    renderHook(() => useRepostCard({ note: WRAPPER, onOpenNote })).result.current.openTarget();
    expect(onOpenNote).not.toHaveBeenCalled();
    mocks.target = { id: 't' };
    renderHook(() => useRepostCard({ note: { ...WRAPPER, id: 'w3' }, onOpenNote })).result.current.openTarget();
    expect(onOpenNote).toHaveBeenCalledWith('t');
  });
});
