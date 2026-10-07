import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useNostrUserSearch } from '@/hooks/identity/useNostrUserSearch';

// Mock the underlying NIP-50 hook so tests don't open real WebSockets.
const mockUseNostrQuery = vi.fn();
vi.mock('@nostr-wot/data/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nostr-wot/data/react')>()),
  useNostrQuery: (...args: unknown[]) => mockUseNostrQuery(...args),
}));

beforeEach(() => {
  mockUseNostrQuery.mockReset();
  mockUseNostrQuery.mockReturnValue({ events: [], loading: false, error: null });
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

/** The hook's SEARCH_DEBOUNCE_MS; the debounce tests fire it explicitly. */
const SEARCH_DEBOUNCE_MS = 250;

describe('useNostrUserSearch', () => {
  it('decodes a 64-hex pubkey as a directHit (no NIP-50 fired)', async () => {
    const hex = 'a'.repeat(64);
    const { result } = renderHook(() => useNostrUserSearch(hex));
    await waitFor(() => expect(result.current.directHit?.pubkey).toBe(hex));
    // When directHit is set, NIP-50 search is disabled.
    const lastCallFilters = mockUseNostrQuery.mock.calls.at(-1)?.[0] as unknown[];
    expect(lastCallFilters).toEqual([]);
  });

  it('passes a NIP-50 kind:0 search filter to useNostrQuery for free text', async () => {
    renderHook(() => useNostrUserSearch('alice'));
    await waitFor(() => {
      const calls = mockUseNostrQuery.mock.calls;
      const last = calls.at(-1);
      expect(last?.[0]).toEqual([{ kinds: [0], search: 'alice', limit: 10 }]);
      expect(last?.[1].relays).toContain('wss://relay.nostr.band');
    });
  });

  it('debounces input changes', async () => {
    // The debounce is a real 250 ms timer; polling for it with a 1 s ceiling
    // lost the race under CPU contention. Own the clock instead.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { rerender } = renderHook(({ q }: { q: string }) => useNostrUserSearch(q), {
      initialProps: { q: 'a' },
    });
    rerender({ q: 'al' });
    rerender({ q: 'ali' });
    const hasAli = () => mockUseNostrQuery.mock.calls.some(
      (c) => Array.isArray(c[0]) && (c[0] as Array<{ search?: string }>)[0]?.search === 'ali',
    );
    // Right after typing, debounced query is still the initial value (or empty),
    // so useNostrQuery has not yet been called with `ali`.
    expect(hasAli()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1); });
    expect(hasAli()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(hasAli()).toBe(true);
  });

  it('parses kind:0 events from useNostrQuery into nostrResults, deduped by pubkey', async () => {
    const ev = (pk: string, name: string) => ({
      id: 'x',
      pubkey: pk,
      kind: 0,
      created_at: 1,
      tags: [],
      sig: 'sig',
      content: JSON.stringify({ name, picture: 'p' }),
    });
    const events = [
      ev('b'.repeat(64), 'Alice'),
      ev('b'.repeat(64), 'Alice (dup)'),
      ev('c'.repeat(64), 'Bob'),
    ];
    mockUseNostrQuery.mockReturnValue({ events, loading: false, error: null });
    const { result } = renderHook(() => useNostrUserSearch('alice'));
    await waitFor(() => {
      expect(result.current.nostrResults).toHaveLength(2);
      expect(result.current.nostrResults[0].displayName).toBe('Alice');
      expect(result.current.nostrResults[0].picture).toBe('p');
    });
  });

  it('resolves NIP-05 identifiers via .well-known/nostr.json', async () => {
    const pk = 'd'.repeat(64);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ names: { alice: pk } }),
    });
    const { result } = renderHook(() => useNostrUserSearch('alice@example.com'));
    await waitFor(() => {
      expect(result.current.nip05Hit?.pubkey).toBe(pk);
      expect(result.current.nip05Hit?.nip05).toBe('alice@example.com');
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/.well-known/nostr.json?name=alice'),
      expect.objectContaining({ mode: 'cors' }),
    );
  });

  it('never shows the previous NIP-05 hit once the query has moved to another identifier', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const alice = 'd'.repeat(64);
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ names: { alice } }) })
      // bob's lookup never answers, so any hit seen while it runs is stale
      .mockReturnValueOnce(new Promise(() => {}));
    const seen: (string | null)[] = [];
    const { result, rerender } = renderHook(({ q }: { q: string }) => {
      const out = useNostrUserSearch(q);
      seen.push(out.nip05Hit?.pubkey ?? null);
      return out;
    }, { initialProps: { q: 'alice@example.com' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 1); });
    expect(result.current.nip05Hit?.pubkey).toBe(alice);

    rerender({ q: 'bob@example.com' });
    seen.length = 0;
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 1); });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((pk) => pk === null)).toBe(true);
    expect(result.current.loading).toBe(true);
  });

  it('returns no results for an empty / too-short query', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { result } = renderHook(() => useNostrUserSearch(''));
    // Past the debounce, so "no results" is the settled answer and not a
    // snapshot taken before the hook had a chance to produce any.
    await act(async () => { await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS + 1); });
    expect(result.current.directHit).toBeNull();
    expect(result.current.nip05Hit).toBeNull();
    expect(result.current.nostrResults).toEqual([]);
  });
});
