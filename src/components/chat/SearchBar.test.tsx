import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import SearchBar from './SearchBar';
import { useSearchStore } from '@/store/search';
import { useSearchHistoryStore } from '@/store/searchHistory';

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
      sort: 'newest',
      activeFilters: {},
      pickerMode: null,
    });
    useSearchHistoryStore.setState({ entries: [] });
  });

  it('renders the search input', () => {
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    expect(screen.getByTestId('search-input')).toBeDefined();
  });

  it('shows the filters + history dropdown when input is focused with no query', () => {
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    fireEvent.focus(screen.getByTestId('search-input'));
    expect(screen.getByTestId('search-hints')).toBeDefined();
    expect(screen.getByTestId('search-filter-row-from')).toBeDefined();
    expect(screen.getByTestId('search-filter-row-in')).toBeDefined();
    expect(screen.getByTestId('search-filter-row-more')).toBeDefined();
  });

  it('clicking a filter row opens the matching picker mode', () => {
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    fireEvent.focus(screen.getByTestId('search-input'));
    fireEvent.mouseDown(screen.getByTestId('search-filter-row-has'));
    expect(useSearchStore.getState().pickerMode).toBe('has');
  });

  it('shows persisted history rows for the active server', () => {
    act(() => {
      useSearchHistoryStore.getState().push('botardo', 's1');
      useSearchHistoryStore.getState().push('graphene', 's1');
      useSearchHistoryStore.getState().push('other-server', 's2');
    });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    fireEvent.focus(screen.getByTestId('search-input'));
    const rows = screen.getAllByTestId('search-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('graphene');
  });

  it('clear-history button empties the list for the server', () => {
    act(() => {
      useSearchHistoryStore.getState().push('botardo', 's1');
    });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    fireEvent.focus(screen.getByTestId('search-input'));
    fireEvent.mouseDown(screen.getByTestId('search-history-clear'));
    expect(useSearchHistoryStore.getState().entries.filter((e) => e.serverId === 's1')).toHaveLength(0);
  });

  it('Escape clears the query and the store', () => {
    useSearchStore.setState({ query: 'test', isOpen: true });
    render(<SearchBar serverId="s1" profileCache={profileCache} />);
    const input = screen.getByTestId('search-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useSearchStore.getState().query).toBe('');
    expect(useSearchStore.getState().isOpen).toBe(false);
  });
});
