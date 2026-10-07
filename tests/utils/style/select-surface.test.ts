import { describe, expect, it } from 'vitest';
import { selectSurfaceClass } from '@/utils/style/select-surface';

describe('selectSurfaceClass', () => {
  it('leaves a bare select unstyled and gives the mobile one its stylesheet class', () => {
    expect(selectSurfaceClass('sm', 'black', 'bare', false)).toBe('');
    expect(selectSurfaceClass('sm', 'black', 'mobile', true)).toBe('appearance-select');
  });

  it('builds the surface from size and tone, with a green focus only while valid', () => {
    const ok = selectSurfaceClass('md', 'dark', 'surface', false);
    expect(ok).toContain('rounded-lg px-3 py-2 text-sm');
    expect(ok).toContain('bg-lc-dark');
    expect(ok).toContain('border-lc-border');
    expect(ok).toContain('focus:border-lc-green');
    const bad = selectSurfaceClass('2xs', 'black', 'surface', true);
    expect(bad).toContain('border-red-500');
    expect(bad).not.toContain('focus:border-lc-green');
  });
});
