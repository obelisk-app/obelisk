import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from './SearchBar';
import { useSearchStore } from '@/store/search';

// Mock formatPubkey
vi.mock('@/lib/nostr', () => ({
  formatPubkey: (pk: string) => pk.slice(0, 8) + '...',
}));

describe('SearchBar', () => {
  const profileCache = new Map<string, { name?: string; picture?: string }>();
  profileCache.set('pk1', { name: 'Alice' });

  beforeEach(() => {
    useSearchStore.setState({
      query: '',
      results: [],
      isSearching: false,
      isOpen: false,
      cursor: null,
      hasMore: false,
    });
  });

  it('renders search toggle button when closed', () => {
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    expect(screen.getByTestId('search-toggle')).toBeDefined();
  });

  it('opens search input when toggle is clicked', () => {
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    fireEvent.click(screen.getByTestId('search-toggle'));
    expect(screen.getByTestId('search-bar')).toBeDefined();
    expect(screen.getByTestId('search-input')).toBeDefined();
  });

  it('shows filter hints when input is focused with no query', async () => {
    useSearchStore.setState({ isOpen: true });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    const input = screen.getByTestId('search-input');
    fireEvent.focus(input);
    expect(screen.getByTestId('search-hints')).toBeDefined();
  });

  it('shows no results message when query has no matches', () => {
    useSearchStore.setState({ isOpen: true, query: 'test' });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    expect(screen.getByTestId('search-no-results')).toBeDefined();
  });

  it('shows search results', () => {
    useSearchStore.setState({
      isOpen: true,
      query: 'hello',
      results: [
        { id: '1', channelId: 'ch1', channelName: 'general', authorPubkey: 'pk1', content: 'hello world', createdAt: '2026-01-01T00:00:00Z', editedAt: null },
      ],
    });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    expect(screen.getByTestId('search-results')).toBeDefined();
    expect(screen.getAllByTestId('search-result')).toHaveLength(1);
  });

  it('closes search on close button click', () => {
    useSearchStore.setState({ isOpen: true, query: 'test' });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    fireEvent.click(screen.getByTestId('search-close'));
    expect(useSearchStore.getState().isOpen).toBe(false);
  });

  it('shows load more button when hasMore is true', () => {
    useSearchStore.setState({
      isOpen: true,
      query: 'test',
      results: [
        { id: '1', channelId: 'ch1', channelName: 'general', authorPubkey: 'pk1', content: 'test', createdAt: '2026-01-01T00:00:00Z', editedAt: null },
      ],
      hasMore: true,
      cursor: 'c1',
    });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    expect(screen.getByTestId('search-load-more')).toBeDefined();
  });
});
