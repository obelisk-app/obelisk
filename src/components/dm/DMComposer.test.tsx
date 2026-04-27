import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nip19 } from 'nostr-tools';
import DMComposer from './DMComposer';
import { useDMStore } from '@/store/dm';
import { useAuthStore } from '@/store/auth';
import { _profileStore, _resetProfileCache } from '@/lib/dm/profile-cache';

const enqueueMock = vi.fn();
const querySyncMock = vi.fn();
vi.mock('@/lib/nostr-coalescer', () => ({
  sharedCoalescer: {
    enqueue: (req: any) => { enqueueMock(req); return () => {}; },
    querySync: (filters: any, opts: any) => querySyncMock(filters, opts),
  },
}));

const profileCache = new Map<string, { name?: string; picture?: string }>();
profileCache.set('abc123'.padEnd(64, '0'), { name: 'Alice' });

describe('DMComposer', () => {
  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
  });

  it('renders the back button, input, and search affordance', () => {
    render(<DMComposer onClose={vi.fn()} profileCache={profileCache} />);
    expect(screen.getByTestId('new-dm-pubkey-input')).toBeInTheDocument();
    expect(screen.getByTestId('dm-composer-cancel')).toBeInTheDocument();
  });

  it('starts chat with valid hex pubkey via Enter key', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const hexPk = 'a'.repeat(64);

    render(<DMComposer onClose={onClose} profileCache={profileCache} />);
    await user.type(screen.getByTestId('new-dm-pubkey-input'), hexPk + '{Enter}');

    expect(useDMStore.getState().activeDMPubkey).toBe(hexPk);
    expect(onClose).toHaveBeenCalled();
  });

  it('starts chat from preview Start button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const hexPk = 'a'.repeat(64);

    render(<DMComposer onClose={onClose} profileCache={profileCache} />);
    await user.type(screen.getByTestId('new-dm-pubkey-input'), hexPk);
    await user.click(screen.getByTestId('start-dm-btn'));

    expect(useDMStore.getState().activeDMPubkey).toBe(hexPk);
    expect(onClose).toHaveBeenCalled();
  });

  it('Enter is a no-op for non-pubkey input (search mode)', async () => {
    const user = userEvent.setup();
    render(<DMComposer onClose={vi.fn()} profileCache={profileCache} />);
    await user.type(screen.getByTestId('new-dm-pubkey-input'), 'invalid-key{Enter}');

    // No error message — the user is just searching, not committing.
    expect(screen.queryByTestId('new-dm-error')).not.toBeInTheDocument();
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('Cancel button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<DMComposer onClose={onClose} profileCache={profileCache} />);
    await user.click(screen.getByTestId('dm-composer-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('DMComposer profile preview', () => {
  const partnerHex = 'b'.repeat(64);
  const validNpub = nip19.npubEncode(partnerHex);
  const myPubkey = 'c'.repeat(64);

  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
    _resetProfileCache();
    enqueueMock.mockClear();
    localStorage.clear();
    useAuthStore.setState({
      ...useAuthStore.getState(),
      profile: { pubkey: myPubkey, name: 'Me', displayName: 'Me' } as unknown as never,
    });
  });

  it('previews resolved profile after valid npub paste, via useProfile', async () => {
    _profileStore().set(`${myPubkey}|${partnerHex}`, {
      event: {} as never,
      parsed: { displayName: 'alice', picture: 'https://example.com/a.png' },
      lastCheckedAt: Date.now(),
    });

    render(<DMComposer onClose={vi.fn()} profileCache={profileCache} />);
    fireEvent.change(screen.getByTestId('new-dm-pubkey-input'), { target: { value: validNpub } });

    expect(await screen.findByText(/alice/i)).toBeInTheDocument();
  });

  it('re-renders preview when a newer profile lands in the store (live SWR)', async () => {
    render(<DMComposer onClose={vi.fn()} profileCache={profileCache} />);
    fireEvent.change(screen.getByTestId('new-dm-pubkey-input'), { target: { value: validNpub } });

    expect(screen.getByTestId('new-dm-preview')).toBeInTheDocument();

    act(() => {
      _profileStore().set(`${myPubkey}|${partnerHex}`, {
        event: {} as never,
        parsed: { displayName: 'alice-from-relay' },
        lastCheckedAt: Date.now(),
      });
    });

    expect(await screen.findByText(/alice-from-relay/i)).toBeInTheDocument();
  });

  it('drops the preview when the input is cleared', async () => {
    _profileStore().set(`${myPubkey}|${partnerHex}`, {
      event: {} as never,
      parsed: { displayName: 'alice' },
      lastCheckedAt: Date.now(),
    });

    render(<DMComposer onClose={vi.fn()} profileCache={profileCache} />);
    const input = screen.getByTestId('new-dm-pubkey-input');
    fireEvent.change(input, { target: { value: validNpub } });
    await screen.findByText(/alice/i);

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.queryByTestId('new-dm-preview')).not.toBeInTheDocument();
  });
});

describe('DMComposer directory search', () => {
  const myPubkey = 'c'.repeat(64);
  const obeliskPubkey = 'a'.repeat(64);
  const nostrPubkey = 'b'.repeat(64);
  const fetchMock = vi.fn();

  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
    _resetProfileCache();
    enqueueMock.mockClear();
    querySyncMock.mockReset();
    fetchMock.mockReset();
    localStorage.clear();
    useAuthStore.setState({
      ...useAuthStore.getState(),
      profile: { pubkey: myPubkey, name: 'Me', displayName: 'Me' } as unknown as never,
    });
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  function jsonResponse(body: unknown) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }

  it('runs DB and Nostr searches in parallel after a debounce', async () => {
    fetchMock.mockReturnValue(jsonResponse({ results: [] }));
    querySyncMock.mockResolvedValue([]);

    render(<DMComposer onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('new-dm-pubkey-input'), { target: { value: 'al' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/users/search?q=al',
        expect.objectContaining({ credentials: 'same-origin' }),
      );
    });
    expect(querySyncMock).toHaveBeenCalledTimes(1);
    const [filters, opts] = querySyncMock.mock.calls[0];
    expect(filters).toEqual([{ kinds: [0], search: 'al', limit: 10 }]);
    // Multiple NIP-50 indexers in parallel for resilience.
    expect(opts.relays).toEqual(expect.arrayContaining(['wss://relay.nostr.band']));
    expect(opts.relays.length).toBeGreaterThan(1);
  });

  it('renders Obelisk results with the "On Obelisk" badge', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      results: [{ pubkey: obeliskPubkey, displayName: 'Alice', picture: null, nip05: 'alice@example.com' }],
    }));
    querySyncMock.mockResolvedValue([]);

    render(<DMComposer onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('new-dm-pubkey-input'), { target: { value: 'alice' } });

    await waitFor(() => {
      expect(screen.getByTestId('dm-search-obelisk-results')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    const obeliskRow = screen.getByTestId('dm-search-obelisk-results')
      .querySelector('[data-testid="dm-search-result"]') as HTMLElement;
    expect(obeliskRow.textContent).toContain('On Obelisk');
  });

  it('renders Nostr results and dedupes pubkeys already in the Obelisk section', async () => {
    fetchMock.mockReturnValue(jsonResponse({
      results: [{ pubkey: obeliskPubkey, displayName: 'Alice', picture: null, nip05: null }],
    }));
    querySyncMock.mockResolvedValue([
      { id: '1', kind: 0, pubkey: obeliskPubkey, created_at: 1, tags: [], sig: 'x', content: '{"name":"Alice"}' },
      { id: '2', kind: 0, pubkey: nostrPubkey, created_at: 2, tags: [], sig: 'x', content: '{"name":"Bob","picture":"p"}' },
    ]);

    render(<DMComposer onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('new-dm-pubkey-input'), { target: { value: 'alice' } });

    await waitFor(() => {
      expect(screen.getByTestId('dm-search-nostr-results')).toBeInTheDocument();
    });

    const nostrSection = screen.getByTestId('dm-search-nostr-results');
    expect(nostrSection.querySelectorAll('[data-testid="dm-search-result"]').length).toBe(1);
    expect(nostrSection.textContent).toContain('Bob');
  });

  it('clicking an Obelisk result starts a DM with that pubkey and closes the composer', async () => {
    const onClose = vi.fn();
    fetchMock.mockReturnValue(jsonResponse({
      results: [{ pubkey: obeliskPubkey, displayName: 'Alice', picture: null, nip05: null }],
    }));
    querySyncMock.mockResolvedValue([]);

    render(<DMComposer onClose={onClose} />);
    fireEvent.change(screen.getByTestId('new-dm-pubkey-input'), { target: { value: 'alice' } });

    await waitFor(() => {
      expect(screen.getByTestId('dm-search-obelisk-results')).toBeInTheDocument();
    });

    const row = screen.getByTestId('dm-search-obelisk-results')
      .querySelector('[data-testid="dm-search-result"]') as HTMLElement;
    fireEvent.click(row);

    expect(useDMStore.getState().activeDMPubkey).toBe(obeliskPubkey);
    expect(onClose).toHaveBeenCalled();
  });

  it('does not run the search when the input parses as a valid npub', async () => {
    fetchMock.mockReturnValue(jsonResponse({ results: [] }));
    querySyncMock.mockResolvedValue([]);

    const npub = nip19.npubEncode(obeliskPubkey);
    render(<DMComposer onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('new-dm-pubkey-input'), { target: { value: npub } });

    await new Promise((r) => setTimeout(r, 350));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(querySyncMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dm-search-results')).not.toBeInTheDocument();
  });
});
