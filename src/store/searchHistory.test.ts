import { describe, it, expect, beforeEach } from 'vitest';
import { useSearchHistoryStore } from './searchHistory';

describe('searchHistory store', () => {
  beforeEach(() => {
    useSearchHistoryStore.setState({ entries: [] });
  });

  it('push adds an entry and dedupes on reuse', () => {
    const { push } = useSearchHistoryStore.getState();
    push('foo', 's1');
    push('bar', 's1');
    push('foo', 's1'); // dedupe + move to front
    const state = useSearchHistoryStore.getState();
    const s1 = state.entries.filter((e) => e.serverId === 's1');
    expect(s1).toHaveLength(2);
    expect(s1[0].query).toBe('foo');
  });

  it('caps per-server history at 10 entries', () => {
    const { push } = useSearchHistoryStore.getState();
    for (let i = 0; i < 15; i++) push(`q${i}`, 's1');
    const s1 = useSearchHistoryStore.getState().entries.filter((e) => e.serverId === 's1');
    expect(s1).toHaveLength(10);
    // most recent first (q14)
    expect(s1[0].query).toBe('q14');
  });

  it('clear only removes entries for the given server', () => {
    const { push, clear } = useSearchHistoryStore.getState();
    push('a', 's1');
    push('b', 's2');
    clear('s1');
    const remaining = useSearchHistoryStore.getState().entries;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].serverId).toBe('s2');
  });

  it('remove drops a single entry', () => {
    const { push, remove } = useSearchHistoryStore.getState();
    push('a', 's1');
    push('b', 's1');
    remove('a', 's1');
    const entries = useSearchHistoryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].query).toBe('b');
  });

  it('push ignores empty/whitespace queries', () => {
    const { push } = useSearchHistoryStore.getState();
    push('   ', 's1');
    expect(useSearchHistoryStore.getState().entries).toHaveLength(0);
  });
});
