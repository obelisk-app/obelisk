import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useKeyedValue } from '@/hooks/useKeyedValue';

describe('useKeyedValue', () => {
  it('holds the first value for a key and takes the new one when the key changes', () => {
    const first = ['wss://a'];
    const { result, rerender } = renderHook(({ list }) => useKeyedValue(list, list.join(',')), {
      initialProps: { list: first },
    });
    expect(result.current).toBe(first);
    rerender({ list: ['wss://a'] });
    expect(result.current).toBe(first);

    const next = ['wss://a', 'wss://b'];
    rerender({ list: next });
    expect(result.current).toBe(next);
    rerender({ list: ['wss://a', 'wss://b'] });
    expect(result.current).toBe(next);
  });
});
