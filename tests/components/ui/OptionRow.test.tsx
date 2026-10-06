import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OptionRow from '@/components/ui/OptionRow';

describe('OptionRow', () => {
  it('is a full-width, left-aligned button of type=button with the focus ring', () => {
    const onClick = vi.fn();
    render(<OptionRow onClick={onClick}>alice</OptionRow>);
    const el = screen.getByRole('button', { name: 'alice' });
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveClass('w-full', 'text-left', 'focus-visible:ring-2', 'hover:bg-lc-border/40');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('active is the keyboard highlight, with no hover tint on top', () => {
    render(<OptionRow active>bob</OptionRow>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('bg-lc-border/60');
    expect(el).not.toHaveClass('hover:bg-lc-border/40');
  });

  it('forwards a ref and passes ARIA and handlers through', () => {
    const ref = { current: null as HTMLButtonElement | null };
    const onMouseDown = vi.fn();
    render(<OptionRow ref={ref} role="option" aria-selected onMouseDown={onMouseDown}>x</OptionRow>);
    const el = screen.getByRole('option', { selected: true });
    expect(ref.current).toBe(el);
    fireEvent.mouseDown(el);
    expect(onMouseDown).toHaveBeenCalled();
  });
});
