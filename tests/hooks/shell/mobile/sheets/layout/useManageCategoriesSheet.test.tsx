import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { EMPTY_LAYOUT } from '@/services/relay/channel-layout';
import { NO_CATEGORY } from '@/utils/shell/mobile/category-options';
import { useManageCategoriesSheet } from '@/hooks/shell/mobile/sheets/layout/useManageCategoriesSheet';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const CHANNELS = [group({ id: 'c1' }), group({ id: 'c2' })];
const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };

describe('useManageCategoriesSheet', () => {
  it('indexes the channels and offers "Uncategorized" first', () => {
    const { result } = renderHook(() => useManageCategoriesSheet('wss://r', EMPTY_LAYOUT, CHANNELS, vi.fn()), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(Object.keys(result.current.channelsById)).toEqual(['c1', 'c2']);
    expect(result.current.catOptions).toEqual([{ id: NO_CATEGORY, name: 'Uncategorized' }]);
  });

  it('adds the typed category on Enter only', () => {
    const { result } = renderHook(() => useManageCategoriesSheet('wss://r', EMPTY_LAYOUT, CHANNELS, vi.fn()), { wrapper: bridgeWrapper(fakeBridge()) });
    act(() => result.current.setNewCategoryName('Games'));
    const other = key('a');
    act(() => result.current.onNewCategoryKeyDown(other));
    expect(other.preventDefault).not.toHaveBeenCalled();
    expect(result.current.draft.categories).toHaveLength(0);
    const enter = key('Enter');
    act(() => result.current.onNewCategoryKeyDown(enter));
    expect(enter.preventDefault).toHaveBeenCalled();
    expect(result.current.draft.categories.map((c) => c.name)).toEqual(['Games']);
    expect(result.current.catOptions.map((o) => o.name)).toEqual(['Uncategorized', 'Games']);
  });
});
