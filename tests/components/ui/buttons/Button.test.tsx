import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Button, { buttonClass } from '@/components/ui/buttons/Button';

describe('Button', () => {
  it('is a real button of type=button by default', () => {
    render(<Button>Go</Button>);
    const el = screen.getByRole('button', { name: 'Go' });
    expect(el.tagName).toBe('BUTTON');
    expect(el).toHaveAttribute('type', 'button');
  });

  it('keeps an explicit submit type', () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('renders the dominant hand-rolled primary at rest', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button')).toHaveClass(
      'rounded-lg', 'bg-lc-green', 'px-4', 'py-1.5', 'text-sm', 'font-semibold', 'text-lc-black', 'disabled:opacity-50',
    );
  });

  it.each([
    ['secondary', ['rounded-md', 'border-lc-border', 'text-lc-white']],
    ['ghost', ['rounded', 'text-lc-muted', 'hover:bg-lc-card']],
    ['danger', ['rounded-full', 'bg-red-600', 'text-white']],
  ] as const)('variant %s', (variant, classes) => {
    render(<Button variant={variant}>x</Button>);
    expect(screen.getByRole('button')).toHaveClass(...classes);
  });

  it.each([
    ['xs', 'px-2'],
    ['sm', 'px-3 py-1.5 text-sm'],
    ['lg', 'py-2'],
    ['icon', 'p-1'],
  ] as const)('size %s', (size, cls) => {
    render(<Button size={size}>x</Button>);
    expect(screen.getByRole('button')).toHaveClass(...cls.split(' '));
  });

  it('every variant has a keyboard focus ring', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const { unmount } = render(<Button variant={variant}>x</Button>);
      expect(screen.getByRole('button')).toHaveClass('focus-visible:ring-2');
      unmount();
    }
  });

  it('loading disables, marks busy and shows a spinner', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const el = screen.getByRole('button');
    expect(el).toBeDisabled();
    expect(el).toHaveAttribute('aria-busy', 'true');
    expect(el.querySelector('.lc-spinner')).not.toBeNull();
    fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled stops clicks; className and data attributes pass through', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick} className="ml-2" data-testid="b">x</Button>);
    const el = screen.getByTestId('b');
    expect(el).toHaveClass('ml-2');
    fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Button pill variants', () => {
  it('pill is the stylesheet primary pill with the shared focus ring', () => {
    render(<Button variant="pill">Save</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('lc-pill-primary', 'focus-visible:ring-2');
    expect(el).not.toHaveClass('rounded-lg', 'bg-lc-green');
  });

  it('pillSecondary is the stylesheet secondary pill', () => {
    render(<Button variant="pillSecondary">Cancel</Button>);
    expect(screen.getByRole('button')).toHaveClass('lc-pill-secondary');
  });

  it.each([
    ['xs', 'text-xs'],
    ['sm', 'text-sm'],
    ['lg', 'text-base'],
  ] as const)('pill size %s sets the type size and no padding utility', (size, cls) => {
    render(<Button variant="pill" size={size}>x</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass(cls);
    expect(el.className).not.toMatch(/\bp[xy]?-/);
  });

  it('pill md leaves the stylesheet size alone', () => {
    render(<Button variant="pill" size="md">x</Button>);
    expect(screen.getByRole('button').className).not.toMatch(/\btext-(xs|sm|base)\b/);
  });
});

describe('Button toolbar sizes and danger tone', () => {
  it.each([
    ['icon-md', ['p-2']],
    ['icon-touch', ['p-2.5', 'md:p-1.5']],
  ] as const)('size %s', (size, classes) => {
    render(<Button variant="ghost" size={size} aria-label="t">x</Button>);
    expect(screen.getByRole('button')).toHaveClass(...classes);
  });

  it('ghost danger turns red on hover instead of white', () => {
    render(<Button variant="ghost" tone="danger" size="icon" aria-label="Delete">x</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('text-lc-muted', 'hover:text-red-400', 'hover:bg-red-500/10');
    expect(el).not.toHaveClass('hover:text-lc-white');
  });

  it('ghost default tone is unchanged', () => {
    render(<Button variant="ghost" size="icon" aria-label="x">x</Button>);
    expect(screen.getByRole('button').className).toBe(
      'inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 rounded text-lc-muted hover:bg-lc-card hover:text-lc-white focus-visible:ring-lc-green/60 p-1',
    );
  });
});

describe('buttonClass', () => {
  it('matches what Button renders', () => {
    render(<Button variant="pill" size="xs">x</Button>);
    expect(screen.getByRole('button').className).toBe(buttonClass({ variant: 'pill', size: 'xs' }));
  });
});

describe('Button outline variants', () => {
  it('outline is the bordered, faintly filled secondary at rounded-lg', () => {
    render(<Button variant="outline" size="xs">Undo</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('rounded-lg', 'border', 'border-lc-border', 'bg-lc-card/60', 'text-lc-white', 'hover:border-lc-green/50', 'px-2', 'py-1', 'text-xs');
    expect(el).not.toHaveClass('rounded-full', 'text-lc-muted');
  });

  it('outlinePill is the same surface as a pill', () => {
    render(<Button variant="outlinePill" size="lg">Cancel</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('rounded-full', 'border-lc-border', 'bg-lc-card/60', 'font-medium', 'px-4', 'py-2', 'text-sm');
    expect(el).not.toHaveClass('rounded-lg', 'lc-pill-secondary');
  });

  it('outline danger is red at rest, not only on hover', () => {
    render(<Button variant="outline" tone="danger" size="xs">Revoke</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('border-red-500/30', 'text-red-300', 'hover:bg-red-500/10', 'focus-visible:ring-red-400/70');
    expect(el).not.toHaveClass('text-lc-white', 'bg-lc-card/60');
  });

  it('both outline variants carry the focus ring and type=button', () => {
    for (const variant of ['outline', 'outlinePill'] as const) {
      const { unmount } = render(<Button variant={variant}>x</Button>);
      const el = screen.getByRole('button');
      expect(el).toHaveClass('focus-visible:ring-2');
      expect(el).toHaveAttribute('type', 'button');
      unmount();
    }
  });

  it('tone still leaves the filled variants alone', () => {
    render(<Button variant="primary" tone="danger">x</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-lc-green');
  });
});

describe('Button accent tone and stylesheet toolbar variants', () => {
  it('outline accent is the green outline, green at rest', () => {
    render(<Button variant="outline" tone="accent" size="sm">Upload</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('rounded-lg', 'border-lc-green/50', 'bg-lc-green/10', 'text-lc-green', 'hover:bg-lc-green/20', 'focus-visible:ring-2');
    expect(el).not.toHaveClass('text-lc-white', 'border-lc-border');
  });

  it('outlinePill accent is the same green outline as a pill', () => {
    render(<Button variant="outlinePill" tone="accent" size="xs">Grant</Button>);
    expect(screen.getByRole('button')).toHaveClass('rounded-full', 'border-lc-green/50', 'text-lc-green');
  });

  it('ghost accent falls back to the default ghost', () => {
    const { unmount } = render(<Button variant="ghost" size="icon" aria-label="a">x</Button>);
    const plain = screen.getByRole('button').className;
    unmount();
    render(<Button variant="ghost" tone="accent" size="icon" aria-label="a">x</Button>);
    expect(screen.getByRole('button').className).toBe(plain);
  });

  it.each([
    ['tool', 'lc-tool'],
    ['toolIcon', 'lc-icon-btn'],
  ] as const)('%s is the stylesheet class with the focus ring and no size utility', (variant, cls) => {
    render(<Button variant={variant} size="sm" aria-label="t">x</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass(cls, 'focus-visible:ring-2');
    expect(el).toHaveAttribute('type', 'button');
    expect(el.className).not.toMatch(/\b(p[xy]?-\S+|text-(xs|sm|base))\b/);
  });

  it('tool passes aria-pressed through for its stylesheet on-state', () => {
    render(<Button variant="tool" aria-pressed>B</Button>);
    expect(screen.getByRole('button', { pressed: true })).toHaveClass('lc-tool');
  });
});

describe('Button pillDanger and the accent open state', () => {
  it('pillDanger is the stylesheet pill with a soft red fill and pill type sizes', () => {
    render(<Button variant="pillDanger" size="xs">Kick</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass('lc-pill', 'bg-red-500/20', 'text-red-300', 'hover:bg-red-500/30', 'text-xs', 'focus-visible:ring-red-400/70');
    expect(el.className).not.toMatch(/\bp[xy]?-/);
  });

  it('accent marks an open disclosure or a pressed toggle with the stronger fill', () => {
    render(<Button variant="outline" tone="accent" aria-expanded>Members</Button>);
    expect(screen.getByRole('button')).toHaveClass('aria-expanded:bg-lc-green/20', 'aria-pressed:bg-lc-green/20');
  });
});

describe('Button compound and phone controls', () => {
  it('bare keeps keyboard focus and native semantics without adding a competing layout', () => {
    render(<Button variant="bare" className="grid custom-tile">Open</Button>);
    const el = screen.getByRole('button', { name: 'Open' });
    expect(el).toHaveAttribute('type', 'button');
    expect(el).toHaveClass('focus-visible:ring-2', 'grid', 'custom-tile');
    expect(el.className).not.toMatch(/\b(inline-flex|items-center|justify-center|gap-2|px-4|py-1.5|bg-lc-green)\b/);
  });

  it.each([
    ['mobilePrimary', 'btn-primary'],
    ['mobileSecondary', 'btn-cancel'],
    ['mobileIcon', 'icon-btn'],
    ['mobileRow', 'settings-row'],
    ['mobileDanger', 'settings-btn-danger'],
  ] as const)('%s owns its phone stylesheet recipe and shared focus behavior', (variant, recipe) => {
    render(<Button variant={variant} disabled>Action</Button>);
    const el = screen.getByRole('button');
    expect(el).toHaveClass(recipe, 'focus-visible:ring-2');
    expect(el).toBeDisabled();
    expect(el).toHaveAttribute('type', 'button');
    expect(el.className).not.toMatch(/\b(px-4|py-1.5|text-sm|inline-flex)\b/);
  });
});
