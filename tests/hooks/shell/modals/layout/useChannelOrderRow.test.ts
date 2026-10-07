import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { useChannelOrderRow } from '@/hooks/shell/modals/layout/useChannelOrderRow';

const dragEvent = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn(), dataTransfer: { effectAllowed: '' } }) as unknown as React.DragEvent & {
  preventDefault: ReturnType<typeof vi.fn>; stopPropagation: ReturnType<typeof vi.fn>;
};

function setup(took: boolean) {
  const props = { onGrab: vi.fn(), onDropBefore: vi.fn(() => took), onChangeCategory: vi.fn() };
  return { ...props, row: renderHook(() => useChannelOrderRow(props)).result.current };
}

describe('useChannelOrderRow', () => {
  it('always accepts a drag over the row', () => {
    const e = dragEvent();
    setup(true).row.onDragOver(e);
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it('keeps a drop it took from reaching the card', () => {
    const e = dragEvent();
    setup(true).row.onDrop(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('lets a drop it refused reach the card', () => {
    const e = dragEvent();
    setup(false).row.onDrop(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('starts a move drag and grabs the channel', () => {
    const e = dragEvent();
    const { row, onGrab } = setup(true);
    row.onDragStart(e);
    expect(e.dataTransfer.effectAllowed).toBe('move');
    expect(onGrab).toHaveBeenCalled();
  });

  it('reads the empty picker option as uncategorized', () => {
    const { row, onChangeCategory } = setup(true);
    row.onCategoryChange({ target: { value: '' } } as React.ChangeEvent<HTMLSelectElement>);
    row.onCategoryChange({ target: { value: 'cat-a' } } as React.ChangeEvent<HTMLSelectElement>);
    expect(onChangeCategory.mock.calls).toEqual([[null], ['cat-a']]);
  });
});
