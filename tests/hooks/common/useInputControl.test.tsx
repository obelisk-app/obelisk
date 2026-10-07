import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInputControl } from '@/hooks/common/useInputControl';

describe('useInputControl', () => {
  it('toggles the secret between hidden and shown', () => {
    const { result } = renderHook(() => useInputControl(undefined, undefined));
    expect(result.current.revealed).toBe(false);
    act(() => result.current.toggleReveal());
    expect(result.current.revealed).toBe(true);
    act(() => result.current.toggleReveal());
    expect(result.current.revealed).toBe(false);
  });

  it('clear runs the caller\'s onClear and hands focus back to the field', () => {
    const onClear = vi.fn();
    const { result } = renderHook(() => useInputControl(undefined, { label: 'Clear', onClear }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    result.current.setRef(input);
    act(() => result.current.onClear());
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
