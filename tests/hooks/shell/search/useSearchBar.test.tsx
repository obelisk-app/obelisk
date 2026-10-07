import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import type { JsSearchHit } from '@/services/nostr-bridge';

vi.mock('@/services/relay/relay-info', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/relay/relay-info')>()),
  fetchRelayInfo: () => Promise.resolve(null),
}));

import { useSearchBar } from '@/hooks/shell/search/useSearchBar';
import { useChatStore } from '@/store/chat';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const PK = 'a'.repeat(64);
const hit = { id: 'm1', pubkey: PK, content: 'x', createdAt: 1, groupId: 'g1' } as JsSearchHit;

function setup(onJump?: (m: JsSearchHit) => void) {
  const searchMessages = vi.fn().mockResolvedValue({ hits: [], partial: false, relayFiltered: true });
  const wrapper = bridgeWrapper(fakeBridge({}, { searchMessages }));
  const inputRef = { current: document.createElement('input') };
  const rootRef = { current: document.createElement('div') };
  document.body.append(rootRef.current);
  return { ...renderHook(() => useSearchBar({ activeGroupId: null, onJump, inputRef, rootRef }), { wrapper }), root: rootRef.current };
}

const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as React.KeyboardEvent<HTMLInputElement>;

beforeEach(() => {
  localStorage.clear();
  useChatStore.getState().reset();
});

describe('useSearchBar', () => {
  it('opens the pane, and expands the phone overlay', () => {
    const { result } = setup();
    act(() => result.current.openPane());
    expect(result.current.open).toBe(true);
    expect(result.current.showFilters).toBe(true);
    act(() => result.current.expandMobile());
    expect(result.current.mobileExpanded).toBe(true);
  });

  it('a press outside closes everything; one inside does not', () => {
    const { result, root } = setup();
    act(() => result.current.expandMobile());
    act(() => { root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.open).toBe(true);
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(result.current.open).toBe(false);
    expect(result.current.mobileExpanded).toBe(false);
  });

  it('picks a recent query or a filter token into the bar', () => {
    const { result } = setup();
    act(() => result.current.pickHistory('hola'));
    expect(result.current.search.raw).toBe('hola');
    expect(result.current.open).toBe(true);
    expect(result.current.showFilters).toBe(false);
    act(() => result.current.closeAndClear());
    expect(result.current.search.raw).toBe('');
    expect(result.current.open).toBe(false);
    act(() => result.current.applyFilter('from:'));
    expect(result.current.search.raw).toContain('from:');
    expect(result.current.open).toBe(true);
  });

  it('Escape clears the query, then closes', () => {
    const { result } = setup();
    act(() => result.current.pickHistory('hola'));
    act(() => result.current.onKeyDown(key('Escape')));
    expect(result.current.search.raw).toBe('');
    expect(result.current.open).toBe(true);
    act(() => result.current.onKeyDown(key('Escape')));
    expect(result.current.open).toBe(false);
  });

  it('a hit goes to the host when it takes one, else the shell jumps', () => {
    const onJump = vi.fn();
    const hosted = setup(onJump);
    act(() => hosted.result.current.jumpTo(hit));
    expect(onJump).toHaveBeenCalledWith(hit);
    useChatStore.getState().reset();
    const plain = setup();
    act(() => plain.result.current.openPane());
    act(() => plain.result.current.jumpTo(hit));
    expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'g1', messageId: 'm1' });
    expect(plain.result.current.open).toBe(false);
  });

  it('previews a person in the shared profile popup and closes', () => {
    const { result } = setup();
    act(() => result.current.openPane());
    act(() => result.current.previewUser(PK));
    expect(useChatStore.getState().profilePopupPubkey).toBe(PK);
    expect(result.current.open).toBe(false);
  });

  it('submits without leaving the page', () => {
    const { result } = setup();
    const preventDefault = vi.fn();
    act(() => result.current.submit({ preventDefault } as unknown as React.FormEvent));
    expect(preventDefault).toHaveBeenCalled();
  });
});
