import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import SearchBar from './SearchBar';
import type { JsGroup, JsSearchHit } from '@/lib/nostr-bridge';
import type { ReactElement } from 'react';
import { useChatStore } from '@/store/chat';

const mockSearchMessages = vi.fn();
const mockSetActiveGroup = vi.fn();

vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {
    searchMessages: (...a: unknown[]) => mockSearchMessages(...a),
    setActiveGroup: (...a: unknown[]) => mockSetActiveGroup(...a),
  },
  useGroups: () => mockGroups,
  useRelayPeople: () => mockPeople,
  useCurrentRelayUrl: () => 'wss://relay.test',
  useUserMetadata: () => null,
}));

vi.mock('@/lib/relay-info', () => ({
  fetchRelayInfo: () => Promise.resolve(mockRelayInfo),
  supportsSearch: (info: { supportedNips?: number[] } | null) =>
    !info?.supportedNips ? true : info.supportedNips.includes(50),
}));

vi.mock('@nostr-wot/data/react', () => ({
  useProfile: () => null,
}));

const mockUseNostrUserSearch = vi.fn();
vi.mock('@/lib/hooks/useNostrUserSearch', () => ({
  useNostrUserSearch: (q: string) => mockUseNostrUserSearch(q),
}));

let mockGroups: JsGroup[] = [];
let mockPeople: Array<{ pubkey: string; displayName: string; role: 'admin' | 'member' }> = [];
let mockRelayInfo: { supportedNips?: number[] } | null = null;

const g = (id: string, name: string): JsGroup => ({
  id, name, about: null, picture: null, banner: null,
  isPublic: true, isHidden: false, isRestricted: false, isOpen: true, parent: null, kind: 'text',
  forumTags: [], topics: [],
});

const hit = (id: string, content: string, over: Partial<JsSearchHit> = {}): JsSearchHit => ({
  id,
  pubkey: 'f'.repeat(64),
  content,
  createdAt: 1_700_000_000,
  kind: 9,
  replyToId: null,
  mentions: [],
  groupId: 'rly/abc',
  ...over,
});

const ok = (hits: JsSearchHit[], over: { partial?: boolean; relayFiltered?: boolean } = {}) => ({
  hits, partial: false, relayFiltered: true, ...over,
});

function renderSearchBar(ui: ReactElement) {
  return render(<LocaleProvider initialLocale="es">{ui}</LocaleProvider>);
}

/** Focus the bar, type into it, and let the debounce + request settle. */
async function typeAndSettle(input: HTMLElement, value: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  mockSearchMessages.mockReset().mockResolvedValue(ok([]));
  mockSetActiveGroup.mockReset();
  useChatStore.getState().reset();
  mockUseNostrUserSearch.mockReset().mockReturnValue({
    directHit: null, nip05Hit: null, nostrResults: [], loading: false,
  });
  mockGroups = [g('rly/abc', 'General'), g('rly/btc', 'Bitcoin')];
  mockPeople = [{ pubkey: 'a'.repeat(64), displayName: 'Alice', role: 'member' }];
  mockRelayInfo = { supportedNips: [1, 29, 50] };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SearchBar', () => {
  it('shows Filtros pane when input is empty and focused', () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    fireEvent.focus(screen.getByPlaceholderText(/Buscar test/));
    expect(screen.getByText('Filtros')).toBeTruthy();
  });

  it('shows Users + Channels + Messages sections for a free-text query', async () => {
    mockUseNostrUserSearch.mockReturnValue({
      directHit: null,
      nip05Hit: null,
      nostrResults: [{ pubkey: 'a'.repeat(64), displayName: 'Alice', picture: null, nip05: null }],
      loading: false,
    });
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    await typeAndSettle(input, 'general');
    expect(screen.getByTestId('search-users-section')).toBeTruthy();
    expect(screen.getByTestId('search-channels-section')).toBeTruthy();
    expect(screen.getByTestId('search-messages-header')).toBeTruthy();
    expect(screen.getByText('#General')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('hides Users + Channels when query has structured tokens', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    await typeAndSettle(input, 'from:npub1abc');
    expect(screen.queryByTestId('search-users-section')).toBeNull();
    expect(screen.queryByTestId('search-channels-section')).toBeNull();
    expect(screen.getByTestId('search-messages-header')).toBeTruthy();
  });

  it('clicking a user opens the shared profile pane state with that pubkey', async () => {
    const pk = 'a'.repeat(64);
    mockUseNostrUserSearch.mockReturnValue({
      directHit: null,
      nip05Hit: null,
      nostrResults: [{ pubkey: pk, displayName: 'Alice', picture: null, nip05: null }],
      loading: false,
    });
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    await typeAndSettle(input, 'alice');
    fireEvent.click(await screen.findByTestId('search-user-row'));
    expect(useChatStore.getState().profilePopupPubkey).toBe(pk);
  });

  it('clicking a channel calls setActiveGroup with its id', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    await typeAndSettle(input, 'general');
    fireEvent.click(await screen.findByTestId('search-channel-row'));
    expect(mockSetActiveGroup).toHaveBeenCalledWith('rly/abc');
  });

  it('renders desktop search labels from the configured language', () => {
    localStorage.setItem('obelisk-dex/search-history', JSON.stringify(['hello']));
    render(
      <LocaleProvider initialLocale="en">
        <SearchBar serverName="test" activeGroupId={null} />
      </LocaleProvider>,
    );

    fireEvent.focus(screen.getByPlaceholderText('Search test'));
    expect(screen.getByText('Filters')).toBeTruthy();
    expect(screen.getByText('From a specific user')).toBeTruthy();
    expect(screen.getByLabelText('Clear history')).toBeTruthy();
  });

  // --- regressions -------------------------------------------------------

  it('searches as you type, without waiting for Enter', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    await typeAndSettle(input, 'hello');
    expect(mockSearchMessages).toHaveBeenCalled();
  });

  it('debounces: fast typing issues one search, for the final text', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.change(input, { target: { value: 'h' } });
    fireEvent.change(input, { target: { value: 'he' } });
    fireEvent.change(input, { target: { value: 'hel' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockSearchMessages).toHaveBeenCalledTimes(1);
    expect(mockSearchMessages.mock.calls[0][0].terms).toEqual([{ text: 'hel', phrase: false }]);
  });

  it('sends multi-word queries as separate terms, not one relay string', async () => {
    // The relay matches `search` as a literal substring of the whole value,
    // so "hola mundo" as a single term returns nothing.
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'hola mundo');
    expect(mockSearchMessages).toHaveBeenCalledWith(expect.objectContaining({
      terms: [{ text: 'hola', phrase: false }, { text: 'mundo', phrase: false }],
    }));
  });

  it('defaults to relay-wide scope, and scopes to the channel only when asked', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId="g1" />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    await typeAndSettle(input, 'hello');
    expect(mockSearchMessages.mock.calls[0][0].groupIds).toBeUndefined();

    fireEvent.click(screen.getByTestId('search-scope-toggle'));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const last = mockSearchMessages.mock.calls.at(-1)![0];
    expect(last.groupIds).toEqual(['g1']);
  });

  it('does not let a slow earlier response overwrite a newer one', async () => {
    let resolveFirst!: (v: unknown) => void;
    mockSearchMessages
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce(ok([hit('new', 'NEWER RESULT')]));

    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    await typeAndSettle(input, 'first');
    await typeAndSettle(input, 'second');
    expect(await screen.findByText('NEWER RESULT')).toBeTruthy();

    // The stale first query now lands; it must be ignored.
    await act(async () => { resolveFirst(ok([hit('old', 'STALE RESULT')])); });
    expect(screen.queryByText('STALE RESULT')).toBeNull();
    expect(screen.getByText('NEWER RESULT')).toBeTruthy();
  });

  it('clears previous results and errors when the query changes', async () => {
    mockSearchMessages.mockResolvedValueOnce(ok([hit('m1', 'FIRST HIT')]));
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    await typeAndSettle(input, 'first');
    expect(screen.getByText('FIRST HIT')).toBeTruthy();

    mockSearchMessages.mockResolvedValueOnce(ok([]));
    await typeAndSettle(input, 'second');
    expect(screen.queryByText('FIRST HIT')).toBeNull();
  });

  it('reports an unresolvable from: instead of silently showing nothing', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'from:nobody');
    expect(screen.getByTestId('search-unresolved').textContent).toContain('from:nobody');
  });

  it('resolves from: by display name', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'from:Alice');
    expect(mockSearchMessages).toHaveBeenCalledWith(expect.objectContaining({
      authors: ['a'.repeat(64)],
    }));
  });

  it('resolves in: by channel name rather than requiring a raw group id', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'in:General');
    expect(mockSearchMessages).toHaveBeenCalledWith(expect.objectContaining({
      groupIds: ['rly/abc'],
    }));
  });

  it('runs a filter-only query instead of early-returning empty', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'in:General');
    expect(mockSearchMessages).toHaveBeenCalled();
  });

  it('parses before:/after: into until/since', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'after:2026-03-01 hello');
    expect(mockSearchMessages).toHaveBeenCalledWith(expect.objectContaining({
      since: Math.floor(Date.UTC(2026, 2, 1) / 1000),
      terms: [{ text: 'hello', phrase: false }],
    }));
  });

  it('warns when the relay does not support NIP-50', async () => {
    mockRelayInfo = { supportedNips: [1, 29] };
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'hello');
    await waitFor(() => expect(screen.getByTestId('search-no-nip50')).toBeTruthy());
    // The NIP-11 probe resolves after the first debounced search, so the
    // query re-runs once capability is known.
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockSearchMessages.mock.calls.at(-1)![0].relaySupportsSearch).toBe(false);
  });

  it('clicking a result requests a jump to that message', async () => {
    mockSearchMessages.mockResolvedValue(ok([hit('m1', 'JUMP TARGET')]));
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'jump');
    fireEvent.click(screen.getByText('JUMP TARGET'));
    expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'rly/abc', messageId: 'm1' });
  });

  it('arrow keys move the active result and Enter jumps to it', async () => {
    mockSearchMessages.mockResolvedValue(ok([hit('m1', 'FIRST'), hit('m2', 'SECOND')]));
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    await typeAndSettle(input, 'x');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe('search-result-1');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useChatStore.getState().pendingJump).toEqual({ groupId: 'rly/abc', messageId: 'm2' });
  });

  it('Escape clears the query, then closes the pane', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    await typeAndSettle(input, 'hello');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Filtros')).toBeNull();
  });

  it('records history only on an explicit commit, and surfaces it immediately', async () => {
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    await typeAndSettle(input, 'hello');
    // Typing alone must not fill history with every prefix.
    expect(JSON.parse(localStorage.getItem('obelisk-dex/search-history') ?? '[]')).toEqual([]);

    fireEvent.submit(input.closest('form')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(JSON.parse(localStorage.getItem('obelisk-dex/search-history') ?? '[]')).toEqual(['hello']);

    // …and is visible without closing and reopening the dropdown.
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('offers Load more only while the result set is partial', async () => {
    mockSearchMessages.mockResolvedValue(ok([hit('m1', 'ONLY')], { partial: false }));
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    await typeAndSettle(input, 'a');
    expect(screen.queryByTestId('search-load-more')).toBeNull();

    mockSearchMessages.mockResolvedValue(ok([hit('m2', 'MORE')], { partial: true }));
    await typeAndSettle(input, 'ab');
    expect(screen.getByTestId('search-load-more')).toBeTruthy();
  });

  it('pages with until and appends without duplicating', async () => {
    mockSearchMessages.mockResolvedValueOnce(
      ok([hit('m1', 'PAGE ONE', { createdAt: 500 })], { partial: true }),
    );
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'a');

    mockSearchMessages.mockResolvedValueOnce(
      ok([hit('m1', 'PAGE ONE', { createdAt: 500 }), hit('m2', 'PAGE TWO', { createdAt: 400 })]),
    );
    await act(async () => { fireEvent.click(screen.getByTestId('search-load-more')); });

    expect(mockSearchMessages.mock.calls.at(-1)![0].until).toBe(499);
    await waitFor(() => expect(screen.getByText('PAGE TWO')).toBeTruthy());
    expect(screen.getAllByText('PAGE ONE')).toHaveLength(1);
  });

  it('renders an npub, never a raw hex prefix, for an unresolved author', async () => {
    mockSearchMessages.mockResolvedValue(ok([hit('m1', 'hello')]));
    renderSearchBar(<SearchBar serverName="test" activeGroupId={null} />);
    await typeAndSettle(screen.getByPlaceholderText(/Buscar test/), 'hello');
    const row = screen.getByTestId('search-result-row');
    expect(row.textContent).not.toContain('ffffffff');
  });
});
