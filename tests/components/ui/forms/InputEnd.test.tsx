import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InputEnd, { endSlotCount } from '@/components/ui/forms/InputEnd';

describe('endSlotCount', () => {
  it('counts each control that will sit in the slot', () => {
    expect(endSlotCount({ loading: false, clear: false, secret: false, suffix: false })).toBe(0);
    expect(endSlotCount({ loading: true, clear: true, secret: false, suffix: true })).toBe(3);
  });
});

describe('InputEnd', () => {
  it('orders spinner, clear, reveal, then the suffix', () => {
    const { container } = render(
      <InputEnd
        controlId="f"
        status="loading"
        clear={{ label: 'Clear', onClear: () => {} }}
        secret={{ kind: 'password', showLabel: 'Show', hideLabel: 'Hide' }}
        revealed={false}
        onToggleReveal={() => {}}
        onClear={() => {}}
        suffix={<span data-testid="suffix" />}
      />,
    );
    const kids = Array.from(container.firstElementChild?.children ?? []);
    expect(kids[0]).toHaveClass('lc-spinner');
    expect(kids[1]).toHaveAccessibleName('Clear');
    expect(kids[2]).toHaveAccessibleName('Show');
    expect(kids[3]).toHaveAttribute('data-testid', 'suffix');
  });

  it('names the reveal button by state and reports clicks', () => {
    const onToggleReveal = vi.fn();
    render(
      <InputEnd
        controlId="f"
        status="idle"
        secret={{ kind: 'nsec', showLabel: 'Show', hideLabel: 'Hide' }}
        revealed
        onToggleReveal={onToggleReveal}
        onClear={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onToggleReveal).toHaveBeenCalledTimes(1);
  });
});
