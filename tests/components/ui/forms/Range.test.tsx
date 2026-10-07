import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Range from '@/components/ui/forms/Range';

describe('Range', () => {
  it('is an accent slider named by aria-label by default', () => {
    render(<Range aria-label="Max hops" min={1} max={4} step={1} value={2} onChange={() => {}} />);
    const el = screen.getByRole('slider', { name: 'Max hops' });
    expect(el).toHaveAttribute('type', 'range');
    expect(el).toHaveClass('w-full', 'accent-lc-green');
    expect(el).toHaveAttribute('max', '4');
  });

  it('overlay stretches invisibly over a custom track', () => {
    render(<Range variant="overlay" aria-label="Progress" className="z-10" />);
    const el = screen.getByRole('slider', { name: 'Progress' });
    expect(el).toHaveClass('absolute', 'inset-0', 'opacity-0', 'z-10');
    expect(el).not.toHaveClass('accent-lc-green');
  });

  it('reports changes', () => {
    const onChange = vi.fn();
    render(<Range aria-label="v" min={0} max={10} value={1} onChange={onChange} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
