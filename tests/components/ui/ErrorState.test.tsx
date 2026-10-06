import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ErrorState from '@/components/ui/ErrorState';

describe('ErrorState', () => {
  it('is an alert in the inline red note style by default', () => {
    render(<ErrorState>Failed</ErrorState>);
    const el = screen.getByRole('alert');
    expect(el.tagName).toBe('P');
    expect(el).toHaveClass('text-xs', 'text-red-400');
    expect(el).toHaveTextContent('Failed');
  });

  it('box variant and element override', () => {
    render(<ErrorState variant="box" as="div" className="mt-2">Failed</ErrorState>);
    const el = screen.getByRole('alert');
    expect(el.tagName).toBe('DIV');
    expect(el).toHaveClass('border-red-500/30', 'bg-red-500/10', 'text-red-300', 'mt-2');
  });
});
