import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAutosizeTextArea } from '@/hooks/common/useAutosizeTextArea';
import { autosizeHeight } from '@/utils/common/autosize';

describe('autosizeHeight', () => {
  it('without a cap the box is the content plus its borders', () => {
    expect(autosizeHeight({ scrollHeight: 90, lineHeight: 20, paddingY: 16, borderY: 2 })).toEqual({ height: 92, overflow: false });
  });

  it('under the cap it fits the content', () => {
    expect(autosizeHeight({ scrollHeight: 56, lineHeight: 20, paddingY: 16, borderY: 2, maxRows: 4 })).toEqual({ height: 58, overflow: false });
  });

  it('over the cap it stops at maxRows lines plus padding and borders, and scrolls', () => {
    expect(autosizeHeight({ scrollHeight: 500, lineHeight: 20, paddingY: 16, borderY: 2, maxRows: 4 })).toEqual({ height: 98, overflow: true });
  });
});

describe('useAutosizeTextArea', () => {
  it('fixed hands back the caller handler untouched', () => {
    const onInput = vi.fn();
    const ref = { current: null };
    const { result } = renderHook(() => useAutosizeTextArea(ref, 'fixed', '', undefined, onInput));
    expect(result.current).toBe(onInput);
  });

  it('auto wraps the caller handler', () => {
    const onInput = vi.fn();
    const ref = { current: null };
    const { result } = renderHook(() => useAutosizeTextArea(ref, 'auto', '', undefined, onInput));
    expect(result.current).not.toBe(onInput);
    expect(typeof result.current).toBe('function');
  });
});
