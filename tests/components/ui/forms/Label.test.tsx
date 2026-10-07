import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Label from '@/components/ui/forms/Label';

describe('Label', () => {
  it('renders a real label for its control', () => {
    render(<><Label htmlFor="name" variant="field">Name</Label><input id="name" /></>);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'name');
  });

  it.each([
    ['field', 'text-[11px] font-medium text-lc-muted'],
    ['caps', 'text-xs uppercase tracking-wider text-lc-muted'],
  ] as const)('%s renders the hand-written string it replaced', (variant, cls) => {
    render(<Label variant={variant} data-testid="l">x</Label>);
    expect(screen.getByTestId('l').className).toBe(cls);
  });

  it('with no variant it adds no class, so a wrapping label keeps the classes it is given', () => {
    render(<Label data-testid="l">x</Label>);
    expect(screen.getByTestId('l')).not.toHaveAttribute('class');
  });

  it('the phone sheet label is the inline style it replaced, with the caller style on top', () => {
    render(<Label variant="sheet" style={{ marginTop: 6 }} data-testid="l">x</Label>);
    const el = screen.getByTestId('l');
    expect(el.style.fontSize).toBe('10px');
    expect(el.style.fontWeight).toBe('600');
    expect(el.style.textTransform).toBe('uppercase');
    expect(el.style.letterSpacing).toBe('0.12em');
    expect(el.style.marginTop).toBe('6px');
    expect(el).not.toHaveAttribute('class');
  });

  it('the monospace sheet label', () => {
    render(<Label variant="sheetMono" data-testid="l">x</Label>);
    const el = screen.getByTestId('l');
    expect(el.style.fontWeight).toBe('500');
    expect(el.style.fontFamily).toContain('JetBrains Mono');
  });
});
