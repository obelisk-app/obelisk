import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRoleEmojiField } from '@/hooks/admin/relay-roles/useRoleEmojiField';

function withButton(result: { current: ReturnType<typeof useRoleEmojiField> }) {
  const button = document.createElement('button');
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ left: 40, top: 20, bottom: 50 } as DOMRect);
  (result.current.buttonRef as { current: HTMLButtonElement | null }).current = button;
}

afterEach(() => vi.restoreAllMocks());

describe('useRoleEmojiField', () => {
  it('toggles the picker open beside the button and shut again', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const { result } = renderHook(() => useRoleEmojiField(vi.fn()));
    withButton(result);
    act(() => result.current.toggle());
    expect(result.current.anchor).toEqual({ left: 40, top: 54 });
    act(() => result.current.toggle());
    expect(result.current.anchor).toBeNull();
  });

  it('stays shut while the button is not mounted', () => {
    const { result } = renderHook(() => useRoleEmojiField(vi.fn()));
    act(() => result.current.toggle());
    expect(result.current.anchor).toBeNull();
  });

  it('picks a unicode glyph, refuses a custom emoji, and closes either way', () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => useRoleEmojiField(onPick));
    withButton(result);
    act(() => result.current.toggle());
    act(() => result.current.pick(':custom:'));
    expect(onPick).not.toHaveBeenCalled();
    expect(result.current.anchor).toBeNull();
    act(() => result.current.toggle());
    act(() => result.current.pick('🔥'));
    expect(onPick).toHaveBeenCalledWith('🔥');
    expect(result.current.anchor).toBeNull();
  });

  it('clear picks the empty badge', () => {
    const onPick = vi.fn();
    renderHook(() => useRoleEmojiField(onPick)).result.current.clear();
    expect(onPick).toHaveBeenCalledWith('');
  });
});
