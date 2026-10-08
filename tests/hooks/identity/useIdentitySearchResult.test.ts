import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const author = vi.hoisted(() => ({ value: { name: null, displayName: null, picture: null, nip05: null } as Record<string, string | null> }));
vi.mock('@/hooks/social/profile/useAuthor', () => ({ useAuthor: () => author.value }));
const status = vi.hoisted(() => ({ value: 'unknown' as string }));
const peek = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/identity/useNip05Status', () => ({ useNip05Status: (...args: unknown[]) => { peek(...args); return status.value; } }));

import { useIdentitySearchResult } from '@/hooks/identity/useIdentitySearchResult';

const PK = 'a'.repeat(64);

describe('useIdentitySearchResult', () => {
  beforeEach(() => {
    author.value = { name: null, displayName: null, picture: null, nip05: null };
    status.value = 'unknown';
    peek.mockClear();
  });

  it('prefers what the search found', () => {
    const { result } = renderHook(() => useIdentitySearchResult({ pubkey: PK, displayName: 'Alice', picture: 'p.png', nip05: 'alice@x.com' }));
    expect(peek).toHaveBeenCalledWith(PK, 'alice@x.com', 'peek');
    expect(result.current).toMatchObject({ name: 'Alice', picture: 'p.png', sub: 'alice@x.com', nip05State: 'unknown', verified: false });
  });

  it('fills a bare pasted key from the resolved profile, and shows a verified handle', () => {
    author.value = { name: 'bob', displayName: 'Bob', picture: 'b.png', nip05: 'bob@x.com' };
    status.value = 'verified';
    const { result } = renderHook(() => useIdentitySearchResult({ pubkey: PK, displayName: null, picture: null, nip05: null } as never));
    expect(result.current).toMatchObject({ name: 'Bob', picture: 'b.png', sub: 'bob@x.com', verified: true, nip05State: 'verified' });
  });

  it('falls back to a short npub and reports no check state without a handle', () => {
    const { result } = renderHook(() => useIdentitySearchResult({ pubkey: PK, displayName: null, picture: null, nip05: null } as never));
    expect(result.current.sub).toMatch(/^npub1/);
    expect(result.current.nip05State).toBeUndefined();
  });
});
