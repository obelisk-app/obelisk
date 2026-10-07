import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Toggle from '@/components/ui/forms/Toggle';

describe('Toggle', () => {
  it('is a switch button reporting its state', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="Sounds" />);
    const el = screen.getByRole('switch', { name: 'Sounds' });
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveAttribute('aria-checked', 'false');
    expect(el).toHaveClass('bg-lc-border');
    expect(el.firstElementChild).toHaveClass('translate-x-0.5');
  });

  it('paints the on state', () => {
    render(<Toggle checked onChange={() => {}} aria-label="Sounds" />);
    const el = screen.getByRole('switch');
    expect(el).toHaveAttribute('aria-checked', 'true');
    expect(el).toHaveClass('bg-lc-green');
    expect(el.firstElementChild).toHaveClass('translate-x-5');
  });

  it('reports the flipped value on click and nothing when disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Toggle checked={false} onChange={onChange} aria-label="s" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Toggle checked={false} onChange={onChange} aria-label="s" disabled />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('Toggle status', () => {
  it('loading is busy, ignores clicks and shows a spinner in the knob', () => {
    const onChange = vi.fn();
    render(<Toggle checked onChange={onChange} aria-label="Sounds" status="loading" />);
    const el = screen.getByRole('switch', { name: 'Sounds' });
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).toBeDisabled();
    fireEvent.click(el);
    expect(onChange).not.toHaveBeenCalled();
    expect(el.querySelector('.lc-spinner')).not.toBeNull();
    expect(el.firstElementChild).toHaveClass('translate-x-5', 'inline-flex');
  });

  it('idle keeps the plain knob', () => {
    render(<Toggle checked={false} onChange={() => {}} aria-label="s" status="idle" />);
    const el = screen.getByRole('switch');
    expect(el).not.toHaveAttribute('aria-busy');
    expect(el.firstElementChild).toHaveClass('inline-block');
    expect(el.querySelector('.lc-spinner')).toBeNull();
  });
});
