import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Badge from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders the common pill by default', () => {
    render(<Badge data-testid="b">3</Badge>);
    expect(screen.getByTestId('b')).toHaveClass('rounded-full', 'px-2', 'py-0.5', 'text-[11px]', 'bg-lc-black', 'text-lc-muted');
  });

  it.each([
    ['accent', 'text-lc-green'],
    ['outline', 'border-lc-border'],
    ['danger', 'text-red-300'],
    ['muted', 'bg-lc-dark'],
  ] as const)('tone %s', (tone, cls) => {
    render(<Badge tone={tone} data-testid="b" />);
    expect(screen.getByTestId('b')).toHaveClass(cls);
  });

  it('sizes, mono and element', () => {
    render(<Badge as="li" size="10" font="mono" className="ml-1" data-testid="b" />);
    const el = screen.getByTestId('b');
    expect(el.tagName).toBe('LI');
    expect(el).toHaveClass('text-[10px]', 'font-mono', 'ml-1');
  });
});
