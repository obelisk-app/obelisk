import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Heading from '@/components/ui/layout/Heading';

describe('Heading', () => {
  it('the level comes from `as`, independent of the variant', () => {
    render(<Heading as="h3" variant="display">Title</Heading>);
    expect(screen.getByRole('heading', { level: 3, name: 'Title' })).toHaveClass('text-4xl', 'md:text-6xl');
  });

  it('with no variant it adds no class, for a heading a stylesheet styles', () => {
    render(<Heading as="h2">Inbox</Heading>);
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveAttribute('class');
  });

  it.each([
    ['page', 'text-4xl font-extrabold tracking-tight text-lc-white md:text-5xl'],
    ['article', 'text-2xl font-bold tracking-tight text-lc-white'],
    ['card', 'text-lg font-semibold text-lc-white'],
    ['panel', 'text-sm font-semibold text-lc-white'],
    ['label', 'text-xs font-semibold uppercase tracking-wider text-lc-muted'],
  ] as const)('%s renders the hand-written string it replaced', (variant, cls) => {
    render(<Heading as="h2" variant={variant}>x</Heading>);
    expect(screen.getByRole('heading').className).toBe(cls);
  });

  it('appends the caller className after the variant', () => {
    render(<Heading as="h2" variant="panel" className="mb-2 truncate">x</Heading>);
    expect(screen.getByRole('heading').className).toBe('text-sm font-semibold text-lc-white mb-2 truncate');
  });

  it('a marketing section title ends in the green period', () => {
    const { container } = render(<Heading as="h2" variant="section">Roadmap</Heading>);
    const heading = screen.getByRole('heading', { level: 2, name: 'Roadmap.' });
    expect(heading).toHaveClass('text-3xl', 'font-bold', 'md:text-4xl');
    const mark = container.querySelector('h2 > span');
    expect(mark).toHaveClass('text-lc-green');
    expect(mark).toHaveTextContent('.');
  });

  it('the accent mark can be a question mark or dropped', () => {
    const { rerender, container } = render(<Heading as="h2" variant="section" accent="?">Ready</Heading>);
    expect(container.querySelector('h2 > span')).toHaveTextContent('?');
    rerender(<Heading as="h2" variant="section" accent={false}>Ready</Heading>);
    expect(container.querySelector('h2 > span')).toBeNull();
  });

  it('other variants carry no mark unless asked', () => {
    const { container } = render(<Heading as="h2" variant="card">Card</Heading>);
    expect(container.querySelector('h2 > span')).toBeNull();
  });
});
