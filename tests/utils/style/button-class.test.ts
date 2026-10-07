import { describe, expect, it } from 'vitest';
import { buttonClass } from '@/utils/style/button-class';

describe('buttonClass', () => {
  it('defaults to the primary md look with the shared focus ring', () => {
    const cls = buttonClass({});
    expect(cls).toContain('bg-lc-green');
    expect(cls).toContain('px-4 py-1.5 text-sm');
    expect(cls).toContain('focus-visible:ring-2');
  });

  it('gives ghost its tone and outline a rounded-lg or pill shape', () => {
    expect(buttonClass({ variant: 'ghost', tone: 'danger' })).toContain('hover:text-red-400');
    expect(buttonClass({ variant: 'outline' })).toContain('rounded-lg border border-lc-border');
    expect(buttonClass({ variant: 'outlinePill', tone: 'accent' })).toContain('rounded-full border border-lc-green/50');
  });

  it('sizes pills by type only and the stylesheet-sized variants not at all', () => {
    expect(buttonClass({ variant: 'pill', size: 'xs' })).toContain('text-xs');
    expect(buttonClass({ variant: 'pill', size: 'xs' })).not.toContain('px-2');
    expect(buttonClass({ variant: 'pill', size: 'md' })).not.toMatch(/text-(xs|sm|base)/);
    expect(buttonClass({ variant: 'tool', size: 'lg' })).not.toContain('py-2');
    expect(buttonClass({ variant: 'zap', size: 'xs' })).not.toContain('px-2 py-1');
  });
});
