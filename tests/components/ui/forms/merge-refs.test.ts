import { describe, expect, it, vi } from 'vitest';
import { mergeRefs } from '@/components/ui/forms/merge-refs';

describe('mergeRefs', () => {
  it('feeds object refs, callback refs and skips undefined', () => {
    const a = { current: null as string | null };
    const b = vi.fn();
    const set = mergeRefs<string>(a, b, undefined);
    set('node');
    expect(a.current).toBe('node');
    expect(b).toHaveBeenCalledWith('node');
    set(null);
    expect(a.current).toBeNull();
    expect(b).toHaveBeenLastCalledWith(null);
  });
});
