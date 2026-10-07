import { describe, expect, it } from 'vitest';
import { inputSurfaceClass } from '@/utils/style/input-surface';
import { inputSurfaceClass as reexported } from '@/components/ui/forms/Input';

describe('inputSurfaceClass', () => {
  it('is still exported from Input', () => {
    expect(reexported).toBe(inputSurfaceClass);
  });

  it('keeps the unadorned padding as the original single string', () => {
    expect(inputSurfaceClass({ size: 'md' })).toContain('px-3 py-2');
    expect(inputSurfaceClass({ size: 'xs' })).toContain('px-2 py-1');
  });

  it('prefix and suffix produce the original padded strings', () => {
    expect(inputSurfaceClass({ size: 'md', adorned: 'prefix' })).toContain('pl-10 pr-3 py-2');
    expect(inputSurfaceClass({ size: 'md', adorned: 'suffix' })).toContain('pl-3 pr-11 py-2');
    expect(inputSurfaceClass({ size: 'sm', adorned: 'prefix' })).toContain('pl-8 pr-2 py-1.5');
    expect(inputSurfaceClass({ size: 'xs', adorned: 'suffix' })).toContain('pl-2 pr-7 py-1');
  });

  it.each([
    ['xs', 'pl-7 pr-12 py-1'],
    ['sm', 'pl-8 pr-14 py-1.5'],
    ['md', 'pl-10 pr-16 py-2'],
    ['lg', 'pl-10 pr-16 py-2.5'],
  ] as const)('both ends with a double end slot, %s', (size, pad) => {
    expect(inputSurfaceClass({ size, adorned: 'both', endWidth: 'double' })).toContain(pad);
  });
});
