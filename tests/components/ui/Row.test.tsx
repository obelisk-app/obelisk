import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Row from '@/components/ui/Row';

describe('Row', () => {
  it('renders the dominant hand-rolled row, flex items-center gap-2', () => {
    render(<Row data-testid="r">x</Row>);
    expect(screen.getByTestId('r')).toHaveClass('flex', 'items-center', 'gap-2');
    expect(screen.getByTestId('r')).not.toHaveClass('flex-wrap');
  });

  it('supports justify, wrap, align and element type', () => {
    render(<Row as="li" justify="between" wrap="wrap" align="start" gap="3" data-testid="r" />);
    const el = screen.getByTestId('r');
    expect(el.tagName).toBe('LI');
    expect(el).toHaveClass('justify-between', 'flex-wrap', 'items-start', 'gap-3');
  });

  it('merges className', () => {
    render(<Row className="px-2" data-testid="r" />);
    expect(screen.getByTestId('r')).toHaveClass('px-2');
  });
});
