import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchBar from './SearchBar';
import type { JsGroup } from '@/lib/nostr-bridge';

const mockSearchMessages = vi.fn();
const mockSetActiveGroup = vi.fn();

vi.mock('@/lib/nostr-bridge', () => ({
  nostrActions: {
    searchMessages: (...a: unknown[]) => mockSearchMessages(...a),
    setActiveGroup: (...a: unknown[]) => mockSetActiveGroup(...a),
  },
  useGroups: () => mockGroups,
}));

vi.mock('@nostr-wot/data/react', () => ({
  useProfile: () => null,
}));

const mockUseNostrUserSearch = vi.fn();
vi.mock('@/lib/hooks/useNostrUserSearch', () => ({
  useNostrUserSearch: (q: string) => mockUseNostrUserSearch(q),
}));

vi.mock('@/components/chat/ProfilePopover', () => ({
  default: ({ pubkey, onClose }: { pubkey: string; onClose: () => void }) => (
    <div data-testid="profile-popover-stub" data-pubkey={pubkey} onClick={onClose}>popover</div>
  ),
}));

let mockGroups: JsGroup[] = [];

const g = (id: string, name: string): JsGroup => ({
  id, name, about: null, picture: null, banner: null,
  isPublic: true, isOpen: true, parent: null, kind: 'text',
  forumTags: [], topics: [],
});

beforeEach(() => {
  mockSearchMessages.mockReset().mockResolvedValue([]);
  mockSetActiveGroup.mockReset();
  mockUseNostrUserSearch.mockReset().mockReturnValue({
    directHit: null, nip05Hit: null, nostrResults: [], loading: false,
  });
  mockGroups = [g('rly/abc', 'General'), g('rly/btc', 'Bitcoin')];
});

describe('SearchBar', () => {
  it('shows Filtros pane when input is empty and focused', () => {
    render(<SearchBar serverName="test" activeGroupId={null} />);
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
    render(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'general' } });
    await waitFor(() => {
      expect(screen.getByTestId('search-users-section')).toBeTruthy();
      expect(screen.getByTestId('search-channels-section')).toBeTruthy();
      expect(screen.getByTestId('search-messages-header')).toBeTruthy();
    });
    // Channels section filters joined groups by name
    expect(screen.getByText('#General')).toBeTruthy();
    // Users section renders the NIP-50 hit
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('hides Users + Channels when query has structured tokens', async () => {
    render(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'from:npub1abc' } });
    await waitFor(() => {
      expect(screen.queryByTestId('search-users-section')).toBeNull();
      expect(screen.queryByTestId('search-channels-section')).toBeNull();
      expect(screen.getByTestId('search-messages-header')).toBeTruthy();
    });
  });

  it('clicking a user opens the ProfilePopover with that pubkey', async () => {
    const pk = 'a'.repeat(64);
    mockUseNostrUserSearch.mockReturnValue({
      directHit: null,
      nip05Hit: null,
      nostrResults: [{ pubkey: pk, displayName: 'Alice', picture: null, nip05: null }],
      loading: false,
    });
    render(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'alice' } });
    const row = await screen.findByTestId('search-user-row');
    fireEvent.click(row);
    const popover = await screen.findByTestId('profile-popover-stub');
    expect(popover.getAttribute('data-pubkey')).toBe(pk);
  });

  it('clicking a channel calls setActiveGroup with its id', async () => {
    render(<SearchBar serverName="test" activeGroupId={null} />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'general' } });
    const row = await screen.findByTestId('search-channel-row');
    fireEvent.click(row);
    expect(mockSetActiveGroup).toHaveBeenCalledWith('rly/abc');
  });

  it('submitting the form runs nostrActions.searchMessages', async () => {
    render(<SearchBar serverName="test" activeGroupId="g1" />);
    const input = screen.getByPlaceholderText(/Buscar test/);
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => {
      expect(mockSearchMessages).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'hello', groupIds: ['g1'] }),
      );
    });
  });
});
