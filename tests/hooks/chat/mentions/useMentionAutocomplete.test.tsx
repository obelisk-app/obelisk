import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MemberInfo } from '@/utils/message-text/mentions';
import { useMentionAutocomplete } from '@/hooks/chat/mentions/useMentionAutocomplete';

const ALICE: MemberInfo = { pubkey: 'a'.repeat(64), displayName: 'Alice Liddell' };
const BOB: MemberInfo = { pubkey: 'b'.repeat(64), displayName: 'Bob' };

function touch(x: number, y: number) {
  return { clientX: x, clientY: y } as unknown as React.Touch;
}

function fakeTouchEnd(x: number, y: number) {
  const prevented = { value: false };
  const e = {
    changedTouches: [touch(x, y)] as unknown as React.TouchList,
    preventDefault: () => { prevented.value = true; },
  } as unknown as React.TouchEvent<HTMLButtonElement>;
  return { e, prevented };
}

describe('useMentionAutocomplete', () => {
  it('derives an npub label and initials for every row, never hex', () => {
    const { result } = renderHook(() => useMentionAutocomplete({
      members: [ALICE, BOB], selectedIndex: 1, onSelect: () => {}, onHover: () => {},
    }));
    const [alice, bob] = result.current.rows;
    expect(alice.keyLabel).toMatch(/^npub1.*…/);
    expect(alice.keyLabel).not.toContain('aaaa');
    expect(alice.initials).toBe('AL');
    expect(bob.initials).toBe('BO');
    expect(alice.active).toBe(false);
    expect(bob.active).toBe(true);
  });

  it('a touch that stayed put selects and is preventDefaulted; a drag does neither', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useMentionAutocomplete({
      members: [ALICE, BOB], selectedIndex: 0, onSelect, onHover: () => {},
    }));
    const row = result.current.rows[1].props;
    row.onTouchStart({ touches: [touch(100, 200)] } as unknown as React.TouchEvent<HTMLButtonElement>);
    const tap = fakeTouchEnd(102, 201);
    row.onTouchEnd(tap.e);
    expect(tap.prevented.value).toBe(true);
    expect(onSelect).toHaveBeenCalledWith(BOB);

    onSelect.mockClear();
    row.onTouchStart({ touches: [touch(100, 200)] } as unknown as React.TouchEvent<HTMLButtonElement>);
    const drag = fakeTouchEnd(104, 260);
    row.onTouchEnd(drag.e);
    expect(drag.prevented.value).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('a touchend without a touchstart is ignored', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useMentionAutocomplete({
      members: [ALICE], selectedIndex: 0, onSelect, onHover: () => {},
    }));
    const { e } = fakeTouchEnd(1, 1);
    result.current.rows[0].props.onTouchEnd(e);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('only wires the outside-click listener when a close handler is given', () => {
    const add = vi.spyOn(document, 'addEventListener');
    renderHook(() => useMentionAutocomplete({
      members: [ALICE], selectedIndex: 0, onSelect: () => {}, onHover: () => {},
    }));
    expect(add.mock.calls.filter(([type]) => type === 'mousedown')).toHaveLength(0);
    const onClose = vi.fn();
    const { result } = renderHook(() => useMentionAutocomplete({
      members: [ALICE], selectedIndex: 0, onSelect: () => {}, onHover: () => {}, onClose,
    }));
    expect(add.mock.calls.filter(([type]) => type === 'mousedown')).toHaveLength(1);
    // The list element the skin attaches; a press inside it must not close.
    const root = document.createElement('div');
    const inside = document.createElement('button');
    root.appendChild(inside);
    document.body.appendChild(root);
    result.current.rootRef.current = root;
    act(() => { inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(onClose).not.toHaveBeenCalled();
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(onClose).toHaveBeenCalledTimes(1);
    root.remove();
    add.mockRestore();
  });

  it('scrolls the selected row into view when the selection moves', () => {
    const scrolled: number[] = [];
    const { result, rerender } = renderHook(
      ({ selectedIndex }: { selectedIndex: number }) => useMentionAutocomplete({
        members: [ALICE, BOB], selectedIndex, onSelect: () => {}, onHover: () => {},
      }),
      { initialProps: { selectedIndex: 0 } },
    );
    result.current.rows.forEach((row, i) => {
      row.props.ref({ scrollIntoView: () => { scrolled.push(i); } } as unknown as HTMLButtonElement);
    });
    rerender({ selectedIndex: 1 });
    expect(scrolled).toContain(1);
  });
});
