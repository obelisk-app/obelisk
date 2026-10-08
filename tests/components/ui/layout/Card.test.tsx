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

it('keeps the themed hover card and glow without adding conflicting surfaces', () => {
  render(<Card variant="interactive" glow padding="hero" data-testid="hero">Content</Card>);
  const card = screen.getByTestId('hero');
  expect(card).toHaveClass('lc-card', 'lc-glow', 'p-12');
  expect(card).not.toHaveClass('bg-lc-dark', 'border-lc-border');
});

it('styles an existing link without adding a wrapper or losing its attributes', () => {
  const { container } = render(<Card variant="interactive" padding="2xl" asChild><a href="https://example.com/guides" className="group" aria-label="Guides">Read</a></Card>);
  const link = screen.getByRole('link', { name: 'Guides' });
  expect(container.firstElementChild).toBe(link);
  expect(link).toHaveAttribute('href', 'https://example.com/guides');
  expect(link).toHaveClass('lc-card', 'p-6', 'group');
});
