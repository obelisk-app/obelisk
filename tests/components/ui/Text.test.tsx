import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Text from '@/components/ui/Text';

describe('Text', () => {
  it('renders a bare span with no class when nothing is set', () => {
    render(<Text data-testid="t">x</Text>);
    const el = screen.getByTestId('t');
    expect(el.tagName).toBe('SPAN');
    expect(el).not.toHaveAttribute('class');
  });

  it('renders the muted hint exactly as hand-rolled', () => {
    render(<Text size="xs" tone="muted" data-testid="t" />);
    expect(screen.getByTestId('t').className).toBe('text-xs text-lc-muted');
  });

  it.each([
    ['10', 'text-[10px]'],
    ['11', 'text-[11px]'],
    ['3xl', 'text-3xl'],
  ] as const)('size %s', (size, cls) => {
    render(<Text size={size} data-testid="t" />);
    expect(screen.getByTestId('t')).toHaveClass(cls);
  });

  it.each([
    ['default', 'text-lc-white'],
    ['accent', 'text-lc-green'],
    ['danger', 'text-red-400'],
  ] as const)('tone %s', (tone, cls) => {
    render(<Text tone={tone} data-testid="t" />);
    expect(screen.getByTestId('t')).toHaveClass(cls);
  });

  it('renders a heading element with weight', () => {
    render(<Text as="h2" size="sm" weight="semibold" tone="default" data-testid="t">Title</Text>);
    const el = screen.getByRole('heading', { level: 2 });
    expect(el.className).toBe('text-sm font-semibold text-lc-white');
  });

  it('renders the section label variant', () => {
    render(<Text variant="label" size="xs" weight="semibold" tone="muted" data-testid="t" />);
    expect(screen.getByTestId('t').className).toBe('text-xs font-semibold uppercase tracking-wider text-lc-muted');
  });

  it('truncates and merges className', () => {
    render(<Text truncate="truncate" className="mt-1" data-testid="t" />);
    expect(screen.getByTestId('t')).toHaveClass('truncate', 'mt-1');
  });
});

describe('Text role sizes', () => {
  it.each([
    ['xs', 'text-xs text-lc-muted'],
    ['11', 'text-[11px] text-lc-muted'],
    ['sm', 'text-sm text-lc-muted'],
    ['13', 'text-[13px] text-lc-muted'],
  ] as const)('muted %s renders exactly the hint string', (size, cls) => {
    render(<Text size={size} tone="muted" data-testid="t" />);
    expect(screen.getByTestId('t').className).toBe(cls);
  });

  it('the panel section label at 10px uses the same tracking as the xs heading', () => {
    render(<Text as="p" variant="label" size="10" weight="semibold" tone="muted" data-testid="t" />);
    expect(screen.getByTestId('t').className).toBe('text-[10px] font-semibold uppercase tracking-wider text-lc-muted');
  });

  it('headings take any level', () => {
    render(<Text as="h3" size="lg" weight="bold" tone="default">Section</Text>);
    expect(screen.getByRole('heading', { level: 3, name: 'Section' })).toHaveClass('text-lg', 'font-bold');
  });
});
