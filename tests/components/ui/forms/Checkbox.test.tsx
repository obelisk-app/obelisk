import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Checkbox from '@/components/ui/forms/Checkbox';

describe('Checkbox', () => {
  it('is a labelled native checkbox in the accent color', () => {
    render(<Checkbox label="Remember me" />);
    const el = screen.getByRole('checkbox', { name: 'Remember me' });
    expect(el).toHaveClass('accent-lc-green');
  });

  it('clicking the label text toggles it', () => {
    const onChange = vi.fn();
    render(<Checkbox label="Remember me" onChange={onChange} />);
    fireEvent.click(screen.getByText('Remember me'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('merges classes on the label and the box', () => {
    render(<Checkbox label="x" className="mt-2" inputClassName="h-4" />);
    const box = screen.getByRole('checkbox');
    expect(box).toHaveClass('h-4');
    expect(box.closest('label')).toHaveClass('mt-2');
  });
});

describe('Checkbox without a visible label', () => {
  it('renders the bare box named by aria-label, with no wrapping label', () => {
    render(<Checkbox aria-label="Select row" className="cursor-pointer" />);
    const el = screen.getByRole('checkbox', { name: 'Select row' });
    expect(el).toHaveClass('accent-lc-green', 'cursor-pointer');
    expect(el.closest('label')).toBeNull();
  });
});

describe('Checkbox notes and disabled', () => {
  it('a hint describes the box', () => {
    render(<Checkbox label="Mirror" hint="Copies every post" />);
    expect(screen.getByRole('checkbox', { name: 'Mirror' })).toHaveAccessibleDescription('Copies every post');
  });

  it('an error describes the box, marks it invalid and is announced', () => {
    render(<Checkbox label="Accept" error="Required" fieldClassName="mt-3" />);
    const el = screen.getByRole('checkbox', { name: 'Accept' });
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveAccessibleDescription('Required');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(el.closest('label')?.parentElement).toHaveClass('mt-3');
  });

  it('without a note it stays a lone label with no description', () => {
    const { container } = render(<Checkbox label="Plain" />);
    expect(container.firstElementChild?.tagName).toBe('LABEL');
    expect(screen.getByRole('checkbox')).not.toHaveAttribute('aria-describedby');
  });

  it('a disabled box dims its label', () => {
    render(<Checkbox label="Off" disabled />);
    const el = screen.getByRole('checkbox', { name: 'Off' });
    expect(el).toBeDisabled();
    expect(el.closest('label')).toHaveClass('has-[:disabled]:opacity-60');
  });
});
