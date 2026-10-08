import { describe, expect, it } from 'vitest';
import { chunkItems } from '@/utils/common/arrays';

describe('chunkItems', () => {
  it('preserves order across full batches and a remainder without mutating input', () => {
    const items = Object.freeze(Array.from({ length: 750 }, (_, index) => `pk${index}`));
    const chunks = chunkItems(items, 300);
    expect(chunks.map((chunk) => chunk.length)).toEqual([300, 300, 150]);
    expect(chunks.flat()).toEqual(items);
    chunks[0].push('extra');
    expect(items).toHaveLength(750);
    expect(chunks[1][0]).toBe('pk300');
  });

  it('does not produce empty trailing batches', () => {
    expect(chunkItems([], 2)).toEqual([]);
    expect(chunkItems([1, 2], 2)).toEqual([[1, 2]]);
    expect(chunkItems([1], 2)).toEqual([[1]]);
  });

  it.each([0, -1, 1.5, Infinity, NaN])('rejects a size that cannot make progress: %s', (size) => {
    expect(() => chunkItems([1, 2], size)).toThrow(RangeError);
  });
});
