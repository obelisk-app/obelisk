import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Stack from '@/components/ui/layout/Stack';

describe('Stack', () => {
  it('renders a flex column with the default gap', () => {
    render(<Stack data-testid="s">x</Stack>);
    expect(screen.getByTestId('s')).toHaveClass('flex', 'flex-col', 'gap-2');
  });

  it.each([
    ['0', 'gap-0'],
    ['1.5', 'gap-1.5'],
    ['6', 'gap-6'],
  ] as const)('maps gap %s to %s', (gap, cls) => {
    render(<Stack gap={gap} data-testid="s" />);
    expect(screen.getByTestId('s')).toHaveClass(cls);
  });

  it('accepts an element type, alignment and className', () => {
    render(<Stack as="ul" align="center" className="mt-2" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.tagName).toBe('UL');
    expect(el).toHaveClass('items-center', 'mt-2');
  });
});
