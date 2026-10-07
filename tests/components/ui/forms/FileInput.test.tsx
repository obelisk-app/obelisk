import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileInput from '@/components/ui/forms/FileInput';

describe('FileInput', () => {
  it('is a hidden file input that forwards its ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<FileInput ref={ref} accept="image/*" data-testid="f" />);
    const el = screen.getByTestId('f');
    expect(el).toHaveAttribute('type', 'file');
    expect(el).toHaveAttribute('accept', 'image/*');
    expect(el).toHaveClass('hidden');
    expect(ref.current).toBe(el);
  });

  it('fires onChange with the chosen files and keeps extra classes', () => {
    const onChange = vi.fn();
    render(<FileInput onChange={onChange} className="peer" data-testid="f" />);
    const el = screen.getByTestId('f');
    expect(el).toHaveClass('hidden', 'peer');
    fireEvent.change(el, { target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
