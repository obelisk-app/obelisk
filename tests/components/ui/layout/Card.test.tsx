import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Card from '@/components/ui/layout/Card';

describe('Card', () => {
  it('defaults to the most common hand-rolled card', () => {
    render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).toBe('rounded-xl border border-lc-border bg-lc-dark p-3');
  });

  it.each([
    ['subtle', 'bg-lc-dark/30'],
    ['muted', 'bg-lc-dark/50'],
    ['black', 'bg-lc-black'],
    ['card', 'bg-lc-card'],
    ['translucent', 'bg-lc-black/40'],
  ] as const)('surface %s', (surface, cls) => {
    render(<Card surface={surface} data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveClass(cls);
  });

  it('supports radius, padding none and element type', () => {
    render(<Card as="section" radius="lg" padding="none" data-testid="c" />);
    const el = screen.getByTestId('c');
    expect(el.tagName).toBe('SECTION');
    expect(el.className).toBe('rounded-lg border border-lc-border bg-lc-dark');
  });

  it('padding row is the list-row card inset', () => {
    render(<Card as="li" surface="black" radius="lg" padding="row" data-testid="c" />);
    const el = screen.getByTestId('c');
    expect(el.tagName).toBe('LI');
    expect(el.className).toBe('rounded-lg border border-lc-border bg-lc-black px-2 py-1.5');
  });

  it('supports a danger border without painting over the parent surface', () => {
    render(<Card as="section" surface="transparent" tone="danger" data-testid="c" />);
    expect(screen.getByTestId('c').className).toBe('rounded-xl border border-red-500/30 p-3');
  });

  it('merges className', () => {
    render(<Card className="mt-2" data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveClass('mt-2');
  });
});
