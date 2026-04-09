import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchStore } from './search';

describe('useSearchStore', () => {
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

  it('has correct initial state', () => {
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
    expect(state.isOpen).toBe(false);
    expect(state.cursor).toBeNull();
    expect(state.hasMore).toBe(false);
  });

  it('setQuery updates query', () => {
    useSearchStore.getState().setQuery('hello');
    expect(useSearchStore.getState().query).toBe('hello');
  });

  it('setResults sets results with cursor and hasMore', () => {
    const results = [
      { id: '1', channelId: 'ch1', channelName: 'general', authorPubkey: 'pk1', content: 'hello', createdAt: '2026-01-01', editedAt: null },
    ];
    useSearchStore.getState().setResults(results, 'cursor-1', true);
    const state = useSearchStore.getState();
    expect(state.results).toEqual(results);
    expect(state.cursor).toBe('cursor-1');
    expect(state.hasMore).toBe(true);
  });

  it('appendResults appends to existing results', () => {
    const r1 = { id: '1', channelId: 'ch1', channelName: 'general', authorPubkey: 'pk1', content: 'hello', createdAt: '2026-01-01', editedAt: null };
    const r2 = { id: '2', channelId: 'ch1', channelName: 'general', authorPubkey: 'pk1', content: 'world', createdAt: '2026-01-02', editedAt: null };
    useSearchStore.getState().setResults([r1], 'c1', true);
    useSearchStore.getState().appendResults([r2], 'c2', false);
    const state = useSearchStore.getState();
    expect(state.results).toHaveLength(2);
    expect(state.cursor).toBe('c2');
    expect(state.hasMore).toBe(false);
  });

  it('setIsSearching updates loading state', () => {
    useSearchStore.getState().setIsSearching(true);
    expect(useSearchStore.getState().isSearching).toBe(true);
  });

  it('setIsOpen toggles open state', () => {
    useSearchStore.getState().setIsOpen(true);
    expect(useSearchStore.getState().isOpen).toBe(true);
  });

  it('clearSearch resets all state', () => {
    useSearchStore.getState().setQuery('test');
    useSearchStore.getState().setIsOpen(true);
    useSearchStore.getState().setIsSearching(true);
    useSearchStore.getState().clearSearch();
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.results).toEqual([]);
    expect(state.isSearching).toBe(false);
    expect(state.isOpen).toBe(false);
  });
});
