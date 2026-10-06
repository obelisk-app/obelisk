import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EmptyState from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders the dominant hand-rolled empty row', () => {
    render(<EmptyState data-testid="e">Nothing here</EmptyState>);
    expect(screen.getByTestId('e').className).toBe('py-10 text-center text-sm text-lc-muted');
  });

  it.each([
    ['sm', 'py-3'],
    ['md', 'py-6'],
  ] as const)('padding %s', (padding, cls) => {
    render(<EmptyState padding={padding} data-testid="e" />);
    expect(screen.getByTestId('e')).toHaveClass(cls);
  });

  it('dashed frame, small text, list item and action', () => {
    render(
      <EmptyState as="li" frame="dashed" size="11" padding="none" action={<button>Add</button>} data-testid="e">
        Empty
      </EmptyState>,
    );
    const el = screen.getByTestId('e');
    expect(el.tagName).toBe('LI');
    expect(el).toHaveClass('border-dashed', 'text-[11px]');
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
