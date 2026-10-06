import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Spinner from '@/components/ui/Spinner';

describe('Spinner', () => {
  it('is decorative without a label', () => {
    const { container } = render(<Spinner />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('lc-spinner');
    expect(el).not.toHaveClass('h-4');
  });

  it('is a status region with a label', () => {
    render(<Spinner label="Loading" />);
    expect(screen.getByRole('status', { name: 'Loading' })).toHaveClass('lc-spinner');
  });

  it.each([
    ['xs', 'h-3'],
    ['sm', 'h-4'],
    ['lg', 'h-8'],
  ] as const)('size %s', (size, cls) => {
    const { container } = render(<Spinner size={size} className="ml-1" />);
    expect(container.firstElementChild).toHaveClass(cls, 'ml-1');
  });
});
