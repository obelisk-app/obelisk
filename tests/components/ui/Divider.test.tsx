import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Divider from '@/components/ui/Divider';

describe('Divider', () => {
  it('renders a decorative 1px rule', () => {
    const { container } = render(<Divider />);
    const el = container.firstElementChild;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el?.className).toBe('h-px bg-lc-border');
  });

  it('adds vertical spacing by variant and merges className', () => {
    const { container } = render(<Divider spacing="sm" className="mx-2" />);
    expect(container.firstElementChild?.className).toBe('h-px bg-lc-border my-1 mx-2');
  });
});
