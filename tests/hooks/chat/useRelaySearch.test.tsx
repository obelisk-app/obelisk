import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsGroup, JsSearchHit } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';

const searchMessages = vi.hoisted(() => vi.fn());
const relayInfo = vi.hoisted(() => ({ current: null as { supportedNips?: number[] } | null }));

const g = (id: string, name: string): JsGroup => ({
  id, name, about: null, picture: null, banner: null,
  isPublic: true, isHidden: false, isRestricted: false, isOpen: true, parent: null, kind: 'text',
  forumTags: [], topics: [],
});

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: { searchMessages: (...a: unknown[]) => searchMessages(...a) },
    useGroups: () => [g('rly/abc', 'General'), g('rly/btc', 'Bitcoin')],
    useRelayPeople: () => [{ pubkey: 'a'.repeat(64), displayName: 'Alice', role: 'member' }],
    useCurrentRelayUrl: () => 'wss://relay.test',
  });
});

vi.mock('@/services/relay-info', () => ({
  fetchRelayInfo: () => Promise.resolve(relayInfo.current),
  supportsSearch: (info: { supportedNips?: number[] } | null) =>
    !info?.supportedNips ? true : info.supportedNips.includes(50),
}));

import { useRelaySearch, SEARCH_DEBOUNCE_MS } from '@/hooks/chat/useRelaySearch';
import { LocaleProvider } from '@tests/support/intl';
import type { ReactNode } from 'react';

/** The hook words its errors through next-intl, so it needs a provider. */
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;


const hit = (id: string, content: string, createdAt = 1_700_000_000): JsSearchHit => ({
  id, pubkey: 'f'.repeat(64), content, createdAt, kind: 9, replyToId: null, mentions: [], groupId: 'rly/abc',
});
const ok = (hits: JsSearchHit[], partial = false) => ({ hits, partial, relayFiltered: true });

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 50); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  searchMessages.mockReset().mockResolvedValue(ok([]));
  relayInfo.current = { supportedNips: [1, 29, 50] };
  useChatStore.getState().reset();
});

afterEach(() => vi.useRealTimers());

describe('useRelaySearch', () => {
  it('is quiet for an empty query and shows every channel', () => {
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    expect(result.current.busy).toBe(false);
    expect(result.current.channelMatches).toHaveLength(2);
    expect(searchMessages).not.toHaveBeenCalled();
  });

  it('debounces typing into one request for the final text, with the terms split', async () => {
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.setRaw('h'));
    act(() => result.current.setRaw('ho'));
    act(() => result.current.setRaw('hola mundo'));
    expect(result.current.busy).toBe(true);
    await settle();
    expect(searchMessages).toHaveBeenCalledTimes(1);
    expect(searchMessages.mock.calls[0][0].terms).toEqual([
      { text: 'hola', phrase: false }, { text: 'mundo', phrase: false },
    ]);
    expect(result.current.busy).toBe(false);
  });

  it('drops a slow earlier response that lands after a newer one', async () => {
    let resolveFirst!: (v: unknown) => void;
    searchMessages
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(ok([hit('new', 'NEWER')]));
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.setRaw('first'));
    await settle();
    act(() => result.current.setRaw('second'));
    await settle();
    expect(result.current.results.map((m) => m.id)).toEqual(['new']);
    await act(async () => { resolveFirst(ok([hit('old', 'STALE')])); });
    expect(result.current.results.map((m) => m.id)).toEqual(['new']);
  });

  it('resolves from: by name and in: by channel, and reports what it cannot resolve', async () => {
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.setRaw('from:Alice in:General'));
    await settle();
    expect(searchMessages).toHaveBeenCalledWith(expect.objectContaining({
      authors: ['a'.repeat(64)], groupIds: ['rly/abc'],
    }));
    act(() => result.current.setRaw('from:nobody'));
    expect(result.current.parsed.unresolved).toEqual([{ key: 'from', value: 'nobody' }]);
    expect(result.current.hasStructuredTokens).toBe(true);
  });

  it('scopes to the open channel only when asked, and only when in: is absent', async () => {
    const { result } = renderHook(() => useRelaySearch({ activeGroupId: 'g1' }), { wrapper });
    act(() => result.current.setRaw('hello'));
    await settle();
    expect(searchMessages.mock.calls[0][0].groupIds).toBeUndefined();
    expect(result.current.canScopeToChannel).toBe(true);
    act(() => result.current.toggleScope());
    await settle();
    expect(searchMessages.mock.calls.at(-1)![0].groupIds).toEqual(['g1']);
    act(() => result.current.setRaw('in:General hello'));
    expect(result.current.canScopeToChannel).toBe(false);
  });

  it('tells the skin when the relay has no NIP-50 and re-runs once that is known', async () => {
    relayInfo.current = { supportedNips: [1, 29] };
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.setRaw('hello'));
    await settle();
    await settle();
    expect(result.current.relaySearchable).toBe(false);
    expect(searchMessages.mock.calls.at(-1)![0].relaySupportsSearch).toBe(false);
  });

  it('pages with until from the oldest hit and appends without duplicates', async () => {
    searchMessages.mockResolvedValueOnce(ok([hit('m1', 'ONE', 500)], true));
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.setRaw('a'));
    await settle();
    expect(result.current.partial).toBe(true);
    expect(result.current.loadMore).not.toBeNull();
    searchMessages.mockResolvedValueOnce(ok([hit('m1', 'ONE', 500), hit('m2', 'TWO', 400)]));
    await act(async () => { result.current.loadMore!(); });
    expect(searchMessages.mock.calls.at(-1)![0].until).toBe(499);
    expect(result.current.results.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('wraps keyboard selection at both ends', async () => {
    searchMessages.mockResolvedValue(ok([hit('m1', 'A'), hit('m2', 'B')]));
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.setRaw('x'));
    await settle();
    expect(result.current.activeIndex).toBe(-1);
    act(() => result.current.moveActive(-1));
    expect(result.current.activeIndex).toBe(1);
    act(() => result.current.moveActive(1));
    expect(result.current.activeIndex).toBe(0);
  });

  it('jumpTo asks the shell to navigate and remembers the query; typing alone does not', async () => {
    searchMessages.mockResolvedValue(ok([hit('m1', 'A')]));
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.setRaw('hello'));
    await settle();
    expect(result.current.history).toEqual([]);
    act(() => result.current.jumpTo(result.current.results[0]));
    expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'rly/abc', messageId: 'm1' });
    expect(result.current.history).toEqual(['hello']);
    act(() => result.current.clearHistory());
    expect(result.current.history).toEqual([]);
    expect(localStorage.getItem('obelisk-dex/search-history')).toBeNull();
  });

  it('applyFilter appends a token to whatever is typed', () => {
    const { result } = renderHook(() => useRelaySearch(), { wrapper });
    act(() => result.current.applyFilter('from:'));
    expect(result.current.raw).toBe('from:');
    act(() => result.current.setRaw('hello '));
    act(() => result.current.applyFilter('has:image'));
    expect(result.current.raw).toBe('hello has:image');
  });
});
