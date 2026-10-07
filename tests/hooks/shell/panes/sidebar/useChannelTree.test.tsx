import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { useChannelTree } from '@/hooks/shell/panes/sidebar/useChannelTree';

const a = groupFixture({ id: 'a' });
const laidOut = { categories: [{ id: 'c1', name: 'Talk', channelIds: ['a'] }], uncategorized: [] };

describe('useChannelTree', () => {
  it('shapes the sections and folds each one on its own', () => {
    const { result } = renderHook(() => useChannelTree(laidOut, { a }));
    expect(result.current.categories[0].groups).toEqual([a]);
    expect(result.current.isCollapsed('c1')).toBe(false);
    act(() => result.current.toggle('c1'));
    expect(result.current.isCollapsed('c1')).toBe(true);
    expect(result.current.isCollapsed('other')).toBe(false);
    act(() => result.current.toggle('c1'));
    expect(result.current.isCollapsed('c1')).toBe(false);
  });
});
