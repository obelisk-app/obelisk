import { describe, expect, it } from 'vitest';
import { sameValues, trimmedValues } from '@/utils/common/form-values';

describe('form values', () => {
  it('trimmedValues trims text and leaves the rest', () => {
    expect(trimmedValues({ a: ' x ', b: 2, c: true })).toEqual({ a: 'x', b: 2, c: true });
  });
});

describe('sameValues', () => {
  it('compares field by field', () => {
    const file = new File(['x'], 'a');
    expect(sameValues({ a: '1', f: file }, { a: '1', f: file })).toBe(true);
    expect(sameValues({ a: '1' }, { a: '2' })).toBe(false);
    expect(sameValues({ a: '1' }, { a: '1', b: '' })).toBe(false);
  });
});
