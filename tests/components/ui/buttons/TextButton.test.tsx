import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TextButton from '@/components/ui/buttons/TextButton';

describe('TextButton', () => {
  it('is a button of type=button with the focus ring; accent by default', () => {
    const onClick = vi.fn();
    render(<TextButton onClick={onClick}>Retry</TextButton>);
    const el = screen.getByRole('button', { name: 'Retry' });
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveClass('text-lc-green', 'hover:underline', 'focus-visible:ring-2');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['muted', ['text-lc-muted', 'underline', 'hover:text-lc-white']],
    ['plain', ['hover:underline']],
  ] as const)('tone %s', (tone, classes) => {
    render(<TextButton tone={tone}>x</TextButton>);
    expect(screen.getByRole('button')).toHaveClass(...classes);
  });

  it('plain sets no colour, so the surrounding text colour shows', () => {
    render(<TextButton tone="plain">x</TextButton>);
    expect(screen.getByRole('button').className).not.toMatch(/\btext-lc-/);
  });

  it('caller classes add size and weight', () => {
    render(<TextButton className="text-xs font-semibold">x</TextButton>);
    expect(screen.getByRole('button')).toHaveClass('text-xs', 'font-semibold');
  });
});
