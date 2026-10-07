import { describe, expect, it } from 'vitest';
import { menuRowClass } from '@/utils/style/menu-row-class';

describe('menuRowClass', () => {
  it('is a white row on a green hover by default', () => {
    expect(menuRowClass()).toContain('text-lc-white hover:bg-lc-green/15');
    expect(menuRowClass()).toContain('rounded-md px-3 py-2');
  });

  it('is red for a destructive row', () => {
    expect(menuRowClass(true)).toContain('text-red-400 hover:bg-red-500/15');
    expect(menuRowClass(true)).not.toContain('text-lc-white');
  });
});
