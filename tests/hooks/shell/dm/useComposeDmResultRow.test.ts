import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const author = vi.hoisted(() => ({ value: { name: null, displayName: null, picture: null, nip05: null } as Record<string, string | null> }));
vi.mock('@/hooks/social/profile/useAuthor', () => ({ useAuthor: () => author.value }));
const status = vi.hoisted(() => ({ value: 'unknown' as string }));
vi.mock('@/hooks/identity/useNip05Status', () => ({ useNip05Status: () => status.value }));

import { useComposeDmResultRow } from '@/hooks/shell/dm/useComposeDmResultRow';

const PK = 'a'.repeat(64);

describe('useComposeDmResultRow', () => {
  beforeEach(() => {
    author.value = { name: null, displayName: null, picture: null, nip05: null };
    status.value = 'unknown';
  });

  it('prefers what the search found', () => {
    const { result } = renderHook(() => useComposeDmResultRow({ pubkey: PK, displayName: 'Alice', picture: 'p.png', nip05: 'alice@x.com' }));
    expect(result.current).toMatchObject({ name: 'Alice', picture: 'p.png', sub: 'alice@x.com', nip05State: 'unknown', verified: false });
  });

  it('fills a bare pasted key from the resolved profile, and shows a verified handle', () => {
    author.value = { name: 'bob', displayName: 'Bob', picture: 'b.png', nip05: 'bob@x.com' };
    status.value = 'verified';
    const { result } = renderHook(() => useComposeDmResultRow({ pubkey: PK, displayName: null, picture: null, nip05: null } as never));
    expect(result.current).toMatchObject({ name: 'Bob', picture: 'b.png', sub: 'bob@x.com', verified: true, nip05State: 'verified' });
  });

  it('falls back to a short npub and reports no check state without a handle', () => {
    const { result } = renderHook(() => useComposeDmResultRow({ pubkey: PK, displayName: null, picture: null, nip05: null } as never));
    expect(result.current.sub).toMatch(/^npub1/);
    expect(result.current.nip05State).toBeUndefined();
  });
});
