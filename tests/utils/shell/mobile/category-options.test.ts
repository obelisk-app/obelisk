import { describe, expect, it } from 'vitest';
import { categoryChannelRows, categoryIdFromOption, categoryOptions } from '@/utils/shell/mobile/category-options';
import { NO_CATEGORY } from '@/constants/shell/mobile';

describe('categoryOptions', () => {
  it('puts "no category" first under the given label', () => {
    expect(categoryOptions([{ id: 'a', name: 'A' }], 'None')).toEqual([{ id: NO_CATEGORY, name: 'None' }, { id: 'a', name: 'A' }]);
  });
});

describe('categoryIdFromOption', () => {
  it('turns the sentinel into null and keeps a real id', () => {
    expect(categoryIdFromOption(NO_CATEGORY)).toBeNull();
    expect(categoryIdFromOption('cat-1')).toBe('cat-1');
  });
});

describe('categoryChannelRows', () => {
  it('skips unknown ids but keeps their place when deciding first and last', () => {
    const byId = { b: 'B', c: 'C' };
    expect(categoryChannelRows(['a', 'b', 'c'], byId)).toEqual([
      { id: 'b', channel: 'B', first: false, last: false },
      { id: 'c', channel: 'C', first: false, last: true },
    ]);
    expect(categoryChannelRows(['b'], byId)).toEqual([{ id: 'b', channel: 'B', first: true, last: true }]);
  });
});
