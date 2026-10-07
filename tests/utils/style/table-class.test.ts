import { describe, expect, it } from 'vitest';
import { tableCellClass } from '@/utils/style/table-class';

describe('tableCellClass', () => {
  it('pads a plain column with the small inset', () => {
    expect(tableCellClass({})).toBe('px-2 py-2');
  });

  it('adds the wide inset, the alignment and the column\'s own classes in that order', () => {
    expect(tableCellClass({ inset: 'md', align: 'right', className: 'w-8' })).toBe('px-3 py-2 text-right w-8');
  });
});
