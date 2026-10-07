import type React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLayoutDrag } from '@/hooks/shell/modals/layout/useLayoutDrag';

function setup() {
  const placeCategory = vi.fn();
  const placeChannel = vi.fn();
  const { result } = renderHook(() => useLayoutDrag({ placeCategory, placeChannel }));
  return { result, placeCategory, placeChannel };
}

describe('useLayoutDrag', () => {
  it('dropping a category on a card moves it to that index', () => {
    const { result, placeCategory, placeChannel } = setup();
    act(() => result.current.grabCategory('cat-a'));
    act(() => result.current.dropOnCategory(2, 'cat-b'));
    expect(placeCategory).toHaveBeenCalledWith('cat-a', 2);
    expect(placeChannel).not.toHaveBeenCalled();
    expect(result.current.dragged).toBeNull();
  });

  it('dropping a channel on a card files it under that category', () => {
    const { result, placeChannel } = setup();
    act(() => result.current.grabChannel('ch'));
    act(() => result.current.dropOnCategory(0, 'cat-b'));
    expect(placeChannel).toHaveBeenCalledWith('ch', 'cat-b');
  });

  it('the uncategorized bucket takes channels and refuses categories', () => {
    const { result, placeChannel } = setup();
    act(() => result.current.grabCategory('cat-a'));
    let took = true;
    act(() => { took = result.current.dropOnUncategorized(); });
    expect(took).toBe(false);
    act(() => result.current.grabChannel('ch'));
    act(() => { took = result.current.dropOnUncategorized(); });
    expect(took).toBe(true);
    expect(placeChannel).toHaveBeenCalledWith('ch', null);
  });

  it('dropping a channel before itself does nothing', () => {
    const { result, placeChannel } = setup();
    act(() => result.current.grabChannel('ch'));
    let took = true;
    act(() => { took = result.current.dropBefore('cat', 'ch'); });
    expect(took).toBe(false);
    act(() => { took = result.current.dropBefore('cat', 'other'); });
    expect(took).toBe(true);
    expect(placeChannel).toHaveBeenCalledWith('ch', 'cat', 'other');
  });

  describe('DOM handlers', () => {
    const event = () => ({ preventDefault: vi.fn(), dataTransfer: { effectAllowed: '' } }) as unknown as React.DragEvent & { preventDefault: ReturnType<typeof vi.fn> };

    it('a card is a drop target only while something is grabbed', () => {
      const { result } = setup();
      const before = event();
      result.current.cardDragOver(before);
      expect(before.preventDefault).not.toHaveBeenCalled();
      const start = event();
      act(() => result.current.startCategoryDrag(start, 'cat-a'));
      expect(start.dataTransfer.effectAllowed).toBe('move');
      const over = event();
      result.current.cardDragOver(over);
      expect(over.preventDefault).toHaveBeenCalled();
    });

    it('a card drop places the grabbed category', () => {
      const { result, placeCategory } = setup();
      act(() => result.current.grabCategory('cat-a'));
      const drop = event();
      act(() => result.current.cardDrop(drop, 1, 'cat-b'));
      expect(drop.preventDefault).toHaveBeenCalled();
      expect(placeCategory).toHaveBeenCalledWith('cat-a', 1);
    });

    it('the bucket accepts and takes channels only', () => {
      const { result, placeChannel } = setup();
      act(() => result.current.grabCategory('cat-a'));
      const refused = event();
      result.current.bucketDragOver(refused);
      act(() => result.current.bucketDrop(refused));
      expect(refused.preventDefault).not.toHaveBeenCalled();
      act(() => result.current.grabChannel('one'));
      const over = event();
      result.current.bucketDragOver(over);
      expect(over.preventDefault).toHaveBeenCalled();
      const drop = event();
      act(() => result.current.bucketDrop(drop));
      expect(drop.preventDefault).toHaveBeenCalled();
      expect(placeChannel).toHaveBeenCalledWith('one', null);
    });
  });
});
