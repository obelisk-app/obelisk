import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { useManageLayoutModal } from '@/hooks/shell/modals/layout/useManageLayoutModal';
import { EMPTY_LAYOUT } from '@/services/relay/channel-layout';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { LocaleProvider } from '@tests/support/intl';

const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as React.KeyboardEvent<HTMLInputElement> & { preventDefault: ReturnType<typeof vi.fn> };

function setup() {
  const channels = [groupFixture({ id: 'one' }), groupFixture({ id: 'two' })];
  return renderHook(() => useManageLayoutModal('wss://relay.test', EMPTY_LAYOUT, channels, vi.fn()), { wrapper: LocaleProvider });
}

describe('useManageLayoutModal', () => {
  it('indexes the channels by id', () => {
    const { result } = setup();
    expect(Object.keys(result.current.channelsById)).toEqual(['one', 'two']);
    expect(result.current.laidOut.uncategorized).toEqual(['one', 'two']);
  });

  it('adds a category on Enter once it has a name', () => {
    const { result } = setup();
    expect(result.current.canAddCategory).toBe(false);
    act(() => result.current.setNewCategoryName('  General '));
    expect(result.current.canAddCategory).toBe(true);
    const other = key('x');
    act(() => result.current.onNewCategoryKeyDown(other));
    expect(other.preventDefault).not.toHaveBeenCalled();
    const enter = key('Enter');
    act(() => result.current.onNewCategoryKeyDown(enter));
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(result.current.laidOut.categories.map((c) => c.name)).toEqual(['General']);
  });

  it('drags a channel into a category', () => {
    const { result } = setup();
    act(() => result.current.setNewCategoryName('General'));
    act(() => result.current.addCategory());
    const catId = result.current.laidOut.categories[0].id;
    act(() => result.current.drag.grabChannel('two'));
    act(() => result.current.drag.dropOnCategory(0, catId));
    expect(result.current.laidOut.categories[0].channelIds).toEqual(['two']);
  });
});
