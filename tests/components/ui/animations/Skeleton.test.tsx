import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Skeleton from '@/components/ui/animations/Skeleton';

describe('Skeleton', () => {
  it('is the .lc-skeleton shimmer block, sized by the caller', () => {
    render(<Skeleton className="h-24 rounded-xl" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('lc-skeleton h-24 rounded-xl');
  });

  it('the round form and the inline span', () => {
    render(<><Skeleton variant="circle" className="h-8 w-8" data-testid="c" /><Skeleton as="span" className="h-2 w-16" data-testid="i" /></>);
    expect(screen.getByTestId('c').className).toBe('lc-skeleton-circle h-8 w-8');
    expect(screen.getByTestId('i').tagName).toBe('SPAN');
  });

  it('the settings rows pulse, colored by the caller', () => {
    render(<Skeleton variant="pulse" className="h-3 w-16 rounded bg-lc-border" data-testid="p" />);
    expect(screen.getByTestId('p').className).toBe('animate-pulse h-3 w-16 rounded bg-lc-border');
  });

  it('a tile can hold content and a status role', () => {
    render(<Skeleton role="status" aria-label="Decrypting"><span>lock</span></Skeleton>);
    expect(screen.getByRole('status', { name: 'Decrypting' })).toHaveTextContent('lock');
  });
});
