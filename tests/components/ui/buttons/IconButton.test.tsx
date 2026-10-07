import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IconButton from '@/components/ui/buttons/IconButton';

describe('IconButton', () => {
  it('is a round 36px ghost button of type=button, named by its aria-label', () => {
    render(<IconButton aria-label="Attach">i</IconButton>);
    const el = screen.getByRole('button', { name: 'Attach' });
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveClass('rounded-full', 'h-9', 'w-9', 'text-lc-muted', 'hover:bg-white/5', 'focus-visible:ring-2', 'disabled:opacity-40');
  });

  it.each([
    ['5', 'h-5 w-5'],
    ['7', 'h-7 w-7'],
    ['8', 'h-8 w-8'],
    ['9', 'h-9 w-9'],
    ['10', 'h-10 w-10'],
    ['11', 'h-11 w-11'],
    ['14', 'h-14 w-14'],
  ] as const)('size %s', (size, cls) => {
    render(<IconButton aria-label="x" size={size}>i</IconButton>);
    expect(screen.getByRole('button')).toHaveClass(...cls.split(' '));
  });

  it.each([
    ['ghost', ['text-lc-muted', 'hover:text-lc-white']],
    ['danger', ['text-lc-muted', 'hover:text-red-400', 'hover:bg-red-500/10']],
    ['dangerSoft', ['bg-red-500/15', 'text-red-400']],
    ['dangerSolid', ['bg-red-500', 'text-white']],
    ['primary', ['bg-lc-green', 'text-lc-black']],
    ['outline', ['border', 'border-lc-border', 'bg-lc-card/60', 'text-lc-white']],
    ['accent', ['border', 'border-lc-green/50', 'bg-lc-green/10', 'text-lc-green']],
    ['overlay', ['bg-black/60', 'text-white', 'hover:bg-black/80']],
  ] as const)('tone %s', (tone, classes) => {
    render(<IconButton aria-label="x" tone={tone}>i</IconButton>);
    expect(screen.getByRole('button')).toHaveClass(...classes);
  });

  it('ghost turns green while pressed', () => {
    render(<IconButton aria-label="Spoiler" aria-pressed>i</IconButton>);
    expect(screen.getByRole('button', { pressed: true })).toHaveClass('aria-pressed:text-lc-green');
  });

  it('square shape is rounded-lg', () => {
    render(<IconButton aria-label="x" shape="square">i</IconButton>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('rounded-lg');
    expect(el).not.toHaveClass('rounded-full');
  });

  it('keeps an explicit type, passes props through and respects disabled', () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Send" type="submit" disabled onClick={onClick} data-testid="b" className="ml-1">i</IconButton>);
    const el = screen.getByTestId('b');
    expect(el).toHaveAttribute('type', 'submit');
    expect(el).toHaveClass('ml-1');
    fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });
});
