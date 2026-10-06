import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Chip from '@/components/ui/Chip';

describe('Chip', () => {
  it('is a toggle button by default, idle and pressable', () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Bitcoin</Chip>);
    const el = screen.getByRole('button', { name: 'Bitcoin' });
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveAttribute('aria-pressed', 'false');
    expect(el).toHaveClass('rounded-full', 'border-lc-border', 'bg-lc-card/60', 'text-lc-white', 'px-3', 'py-1', 'text-xs');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('selected is the one green', () => {
    render(<Chip state="selected">On</Chip>);
    const el = screen.getByRole('button');
    expect(el).toHaveAttribute('aria-pressed', 'true');
    expect(el).toHaveClass('border-lc-green/40', 'bg-lc-green/15', 'text-lc-green');
    expect(el).not.toHaveClass('border-lc-border');
  });

  it('radio behaviour exposes role and aria-checked instead of aria-pressed', () => {
    render(<div role="radiogroup"><Chip behavior="radio" state="selected">A</Chip><Chip behavior="radio">B</Chip></div>);
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'A' })).not.toHaveAttribute('aria-pressed');
  });

  it.each([
    ['10', 'text-[10px]'],
    ['11', 'text-[11px]'],
    ['touch', 'py-1.5'],
  ] as const)('size %s', (size, cls) => {
    render(<Chip size={size}>x</Chip>);
    expect(screen.getByRole('button')).toHaveClass(cls);
  });

  it('has the focus ring and dims when disabled', () => {
    render(<Chip disabled>x</Chip>);
    const el = screen.getByRole('button');
    expect(el).toBeDisabled();
    expect(el).toHaveClass('focus-visible:ring-2', 'disabled:opacity-40');
  });
});
