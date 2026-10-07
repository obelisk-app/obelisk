import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Input from '@/components/ui/forms/Input';

describe('Input', () => {
  it('renders a bare input with the md surface when unlabelled', () => {
    render(<Input placeholder="Search" />);
    const el = screen.getByPlaceholderText('Search');
    expect(el).toHaveClass('rounded-lg', 'bg-lc-black', 'px-3', 'py-2', 'text-sm');
    expect(document.querySelector('label')).toBeNull();
  });

  it('sm matches the modal inputClasses string', () => {
    render(<Input size="sm" placeholder="p" />);
    expect(screen.getByPlaceholderText('p')).toHaveClass('rounded', 'px-2', 'py-1.5');
  });

  it('a label becomes an accessible name through a real <label for>', () => {
    render(<Input label="Relay URL" />);
    expect(screen.getByLabelText('Relay URL').tagName).toBe('INPUT');
  });

  it('an error marks the control invalid and is described by it', () => {
    render(<Input label="Relay URL" error="Not a wss:// URL" />);
    const el = screen.getByLabelText('Relay URL');
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveAccessibleDescription('Not a wss:// URL');
  });

  it('passes through value handling, className and an explicit id', () => {
    const onChange = vi.fn();
    render(<Input id="q" value="" onChange={onChange} className="mb-3" data-testid="i" />);
    const el = screen.getByTestId('i');
    expect(el).toHaveAttribute('id', 'q');
    expect(el).toHaveClass('mb-3');
    fireEvent.change(el, { target: { value: 'x' } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('Input sizes', () => {
  it.each([
    ['xs', ['rounded', 'px-2', 'py-1', 'text-xs']],
    ['sm', ['rounded', 'px-2', 'py-1.5', 'text-sm']],
    ['md', ['rounded-lg', 'px-3', 'py-2', 'text-sm']],
    ['lg', ['rounded-xl', 'px-3', 'py-2.5', 'text-sm']],
  ] as const)('%s', (size, classes) => {
    render(<Input size={size} placeholder="p" />);
    expect(screen.getByPlaceholderText('p')).toHaveClass(...classes);
  });

  it('fontSize overrides the size default without touching the padding', () => {
    render(<Input size="md" fontSize="xs" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('text-xs', 'px-3', 'py-2');
    expect(el).not.toHaveClass('text-sm');
  });
});

describe('Input variants', () => {
  it('pill is the surface fully rounded', () => {
    render(<Input variant="pill" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('rounded-full', 'border', 'bg-lc-black');
    expect(el).not.toHaveClass('rounded-lg');
  });

  it('ghost has no border and a focus ring', () => {
    render(<Input variant="ghost" size="xs" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('bg-lc-black/50', 'focus:ring-1', 'focus:ring-lc-green', 'px-2', 'py-1', 'text-xs');
    expect(el).not.toHaveClass('border');
  });

  it('mobile is the stylesheet class alone', () => {
    render(<Input variant="mobile" placeholder="p" />);
    expect(screen.getByPlaceholderText('p').className).toBe('setup-input');
  });

  it('bare carries only the caller classes', () => {
    render(<Input variant="bare" className="flex-1 bg-transparent" placeholder="p" />);
    expect(screen.getByPlaceholderText('p').className).toBe('flex-1 bg-transparent');
  });
});

describe('Input tone', () => {
  it('dark swaps the black box for the panel color', () => {
    render(<Input tone="dark" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('bg-lc-dark');
    expect(el).not.toHaveClass('bg-lc-black');
  });
});

describe('Input invalid and adornments', () => {
  it('invalid swaps the border to red and sets aria-invalid', () => {
    render(<Input invalid placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveAttribute('aria-invalid', 'true');
    expect(el).toHaveClass('border-red-500');
    expect(el).not.toHaveClass('border-lc-border');
    expect(el).not.toHaveClass('focus:border-lc-green');
  });

  it('a prefix pads the start and sits in a relative wrapper', () => {
    render(<Input prefix={<svg data-testid="icon" />} wrapperClassName="flex-1" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('pl-10', 'pr-3');
    expect(el).not.toHaveClass('px-3');
    const wrapper = el.parentElement;
    expect(wrapper).toHaveClass('relative', 'flex-1');
    expect(screen.getByTestId('icon').parentElement).toHaveClass('absolute', 'left-3', 'pointer-events-none');
  });

  it('a suffix pads the end and stays interactive', () => {
    render(<Input size="lg" suffix={<button type="button">dice</button>} placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('pl-3', 'pr-11', 'py-2.5');
    const slot = screen.getByRole('button', { name: 'dice' }).parentElement;
    expect(slot).toHaveClass('absolute', 'right-2');
    expect(slot).not.toHaveClass('pointer-events-none');
  });

  it('an adorned, labelled input still names the control', () => {
    render(<Input label="Name" suffix={<span>x</span>} />);
    expect(screen.getByLabelText('Name').tagName).toBe('INPUT');
  });

  it('forwards the ref to the input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} prefix={<span>i</span>} placeholder="p" />);
    expect(ref.current).toBe(screen.getByPlaceholderText('p'));
  });
});

describe('Input clear button', () => {
  const clear = (onClear = vi.fn()) => ({ label: 'Clear search', onClear });

  it('shows a named clear button while the value is non-empty, and none when empty', () => {
    const { rerender } = render(<Input value="abc" onChange={() => {}} clear={clear()} placeholder="p" />);
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('p')).toHaveClass('pr-11');
    rerender(<Input value="" onChange={() => {}} clear={clear()} placeholder="p" />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    expect(screen.getByPlaceholderText('p')).toHaveClass('px-3');
  });

  it('calls onClear and puts focus back in the field', () => {
    const onClear = vi.fn();
    render(<Input value="abc" onChange={() => {}} clear={clear(onClear)} placeholder="p" />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText('p')).toHaveFocus();
  });

  it('is hidden on a disabled or read-only field', () => {
    const { rerender } = render(<Input value="abc" onChange={() => {}} clear={clear()} disabled />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<Input value="abc" readOnly clear={clear()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('still forwards the caller ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} value="x" onChange={() => {}} clear={clear()} placeholder="p" />);
    expect(ref.current).toBe(screen.getByPlaceholderText('p'));
  });
});

describe('Input secret', () => {
  const labels = { showLabel: 'Show key', hideLabel: 'Hide key' } as const;

  it('password masks the value and the button reveals and hides it again', () => {
    render(<Input secret={{ kind: 'password', ...labels }} placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    expect(el).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide key' }));
    expect(el).toHaveAttribute('type', 'password');
  });

  it('the reveal button points at the field it controls', () => {
    render(<Input id="k" secret={{ kind: 'password', ...labels }} />);
    expect(screen.getByRole('button', { name: 'Show key' })).toHaveAttribute('aria-controls', 'k');
  });

  it('nsec is monospace and opted out of autocomplete, spellcheck and autocapitalise', () => {
    render(<Input secret={{ kind: 'nsec', ...labels }} placeholder="nsec1..." />);
    const el = screen.getByPlaceholderText('nsec1...');
    expect(el).toHaveClass('font-mono');
    expect(el).toHaveAttribute('autocomplete', 'off');
    expect(el).toHaveAttribute('spellcheck', 'false');
    expect(el).toHaveAttribute('autocapitalize', 'none');
    expect(el).toHaveAttribute('autocorrect', 'off');
  });

  it('password keeps the browser defaults and no mono face', () => {
    render(<Input secret={{ kind: 'password', ...labels }} placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).not.toHaveClass('font-mono');
    expect(el).not.toHaveAttribute('autocomplete');
  });
});

describe('Input status', () => {
  it('loading adds an end spinner and aria-busy, and keeps the field editable', () => {
    render(<Input status="loading" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el).not.toBeDisabled();
    expect(el).toHaveClass('pr-11');
    expect(el.parentElement?.querySelector('.lc-spinner')).not.toBeNull();
  });

  it('idle is the plain field', () => {
    render(<Input status="idle" placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).not.toHaveAttribute('aria-busy');
    expect(el.parentElement?.querySelector('.lc-spinner')).toBeNull();
  });

  it('two end controls widen the end padding', () => {
    render(<Input status="loading" value="q" onChange={() => {}} clear={{ label: 'Clear', onClear: () => {} }} placeholder="p" />);
    const el = screen.getByPlaceholderText('p');
    expect(el).toHaveClass('pr-16');
    expect(el).not.toHaveClass('pr-11');
  });
});

describe('Input prefix and suffix together', () => {
  it('pads both ends', () => {
    render(<Input prefix={<span>i</span>} suffix={<span>s</span>} placeholder="p" />);
    expect(screen.getByPlaceholderText('p')).toHaveClass('pl-10', 'pr-11', 'py-2');
  });

  it('disabled dims the surface', () => {
    render(<Input disabled placeholder="p" />);
    expect(screen.getByPlaceholderText('p')).toHaveClass('disabled:opacity-60');
  });
});
