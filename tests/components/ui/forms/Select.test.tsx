import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Select from '@/components/ui/forms/Select';

describe('Select', () => {
  it('renders a native select with the sm surface by default', () => {
    render(
      <Select aria-label="Sort">
        <option value="a">A</option>
      </Select>,
    );
    const el = screen.getByRole('combobox', { name: 'Sort' });
    expect(el.tagName).toBe('SELECT');
    expect(el).toHaveClass('rounded', 'bg-lc-black', 'text-sm');
  });

  it.each([
    ['xs', 'text-xs'],
    ['md', 'rounded-lg'],
  ] as const)('size %s', (size, cls) => {
    render(<Select size={size} aria-label="s"><option>x</option></Select>);
    expect(screen.getByRole('combobox')).toHaveClass(cls);
  });

  it('labels through a real <label for>', () => {
    render(<Select label="Language"><option>en</option></Select>);
    expect(screen.getByLabelText('Language').tagName).toBe('SELECT');
  });
});

describe('Select sizes, tones and variants', () => {
  it('2xs is the dense inline picker', () => {
    render(<Select size="2xs" aria-label="s"><option>x</option></Select>);
    expect(screen.getByRole('combobox')).toHaveClass('px-1.5', 'py-0.5', 'text-xs', 'rounded');
  });

  it('tone dark sits on a black surface', () => {
    render(<Select tone="dark" aria-label="s"><option>x</option></Select>);
    const el = screen.getByRole('combobox');
    expect(el).toHaveClass('bg-lc-dark');
    expect(el).not.toHaveClass('bg-lc-black');
  });

  it('mobile is the stylesheet class alone', () => {
    render(<Select variant="mobile" aria-label="s"><option>x</option></Select>);
    expect(screen.getByRole('combobox').className).toBe('appearance-select');
  });

  it('bare leaves styling to the caller', () => {
    render(<Select variant="bare" style={{ maxWidth: 110 }} aria-label="s"><option>x</option></Select>);
    const el = screen.getByRole('combobox');
    expect(el.className).toBe('');
    expect(el).toHaveStyle({ maxWidth: '110px' });
  });

  it('invalid turns the border red and drops the green focus', () => {
    render(<Select invalid aria-label="s"><option>x</option></Select>);
    const el = screen.getByRole('combobox');
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveClass('border-red-500');
    expect(el).not.toHaveClass('focus:border-lc-green');
  });
});

describe('Select status and disabled', () => {
  it('loading disables the select, marks it busy and shows a spinner beside it', () => {
    render(<Select status="loading" aria-label="Relay"><option>x</option></Select>);
    const el = screen.getByRole('combobox', { name: 'Relay' });
    expect(el).toBeDisabled();
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el.parentElement?.querySelector('.lc-spinner')).not.toBeNull();
  });

  it('idle renders the bare select with no wrapper', () => {
    const { container } = render(<Select aria-label="Relay"><option>x</option></Select>);
    expect(container.firstElementChild?.tagName).toBe('SELECT');
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-busy');
  });

  it('disabled dims the surface like Input does', () => {
    render(<Select disabled aria-label="Relay"><option>x</option></Select>);
    const el = screen.getByRole('combobox');
    expect(el).toBeDisabled();
    expect(el).toHaveClass('disabled:opacity-60', 'disabled:cursor-not-allowed');
  });

  it('an error is shown under the select and describes it', () => {
    render(<Select label="Relay" error="Pick one"><option>x</option></Select>);
    const el = screen.getByLabelText('Relay');
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveAccessibleDescription('Pick one');
  });
});
