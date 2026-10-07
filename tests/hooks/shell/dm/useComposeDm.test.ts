import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';

const search = vi.hoisted(() => ({ result: { directHit: null, nip05Hit: null, nostrResults: [], loading: false } as Record<string, unknown> }));
vi.mock('@/hooks/identity/useNostrUserSearch', () => ({ useNostrUserSearch: () => search.result }));
const recorded = vi.hoisted(() => [] as Array<[string, string]>);
vi.mock('@/services/identity/nip05-verify', () => ({
  recordNip05Resolution: (pk: string, nip05: string) => recorded.push([pk, nip05]),
}));

import { useComposeDm } from '@/hooks/shell/dm/useComposeDm';

const hit = (c: string, nip05: string | null = null) => ({ pubkey: c.repeat(64), displayName: c, picture: null, nip05 });
const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as React.KeyboardEvent<HTMLInputElement>;

function setup() {
  const onClose = vi.fn();
  const onPicked = vi.fn();
  const inputRef = { current: document.createElement('input') };
  document.body.append(inputRef.current);
  const view = renderHook(() => useComposeDm({ onClose, onPicked, inputRef }));
  expect(document.activeElement).toBe(inputRef.current);
  return { ...view, onClose, onPicked };
}

describe('useComposeDm', () => {
  beforeEach(() => {
    search.result = { directHit: null, nip05Hit: null, nostrResults: [hit('a'), hit('b')], loading: false };
    recorded.length = 0;
  });

  it('records a NIP-05 hit the search resolved', () => {
    search.result = { ...search.result, nip05Hit: hit('c', 'carol@x.com') };
    setup();
    expect(recorded).toEqual([['c'.repeat(64), 'carol@x.com']]);
  });

  it('moves the highlight with the arrows and opens it on Enter', () => {
    const { result, onPicked } = setup();
    const down = key('ArrowDown');
    act(() => result.current.onKeyDown(down));
    expect(down.preventDefault).toHaveBeenCalled();
    expect(result.current.selected).toBe(1);
    act(() => result.current.onKeyDown(key('Enter')));
    expect(onPicked).toHaveBeenCalledWith('b'.repeat(64));
  });

  it('a new query puts the highlight back at the top', () => {
    const { result } = setup();
    act(() => result.current.highlight(1));
    act(() => result.current.setQuery('al'));
    expect(result.current.query).toBe('al');
    expect(result.current.selected).toBe(0);
    expect(result.current.searching).toBe(true);
  });

  it('closes on Escape and leaves other keys alone', () => {
    const { result, onClose } = setup();
    const other = key('x');
    act(() => result.current.onKeyDown(other));
    expect(other.preventDefault).not.toHaveBeenCalled();
    act(() => result.current.onKeyDown(key('Escape')));
    expect(onClose).toHaveBeenCalled();
  });
});
