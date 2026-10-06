import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon, EyeIcon, EyeOffIcon, ZapIcon } from '@/components/ui/icons';

describe('icons', () => {
  it('ChevronLeftIcon draws the back chevron the inline copies used', () => {
    const { container } = render(<ChevronLeftIcon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '16');
    expect(svg?.querySelector('path')).toHaveAttribute('d', 'm15 18-6-6 6-6');
  });

  it('lets a stylesheet-sized caller override size and stroke', () => {
    const { container } = render(<ChevronLeftIcon size={20} strokeWidth={2} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('stroke-width', '2');
  });

  it.each([
    ['CheckIcon', CheckIcon],
    ['EyeIcon', EyeIcon],
    ['EyeOffIcon', EyeOffIcon],
    ['ChevronUpIcon', ChevronUpIcon],
    ['ChevronDownIcon', ChevronDownIcon],
  ] as const)('%s is decorative and uses currentColor', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
    expect(svg).toHaveAttribute('focusable', 'false');
  });
});

describe('ChevronUpIcon / ChevronDownIcon', () => {
  it('are mirror images of one chevron', () => {
    const up = render(<ChevronUpIcon />).container.querySelector('path');
    const down = render(<ChevronDownIcon />).container.querySelector('path');
    expect(up).toHaveAttribute('d', 'm18 15-6-6-6 6');
    expect(down).toHaveAttribute('d', 'm6 9 6 6 6-6');
  });
});

describe('ZapIcon', () => {
  it('draws the solid bolt with no stroke when filled, matching the copies it replaced', () => {
    const { container } = render(<ZapIcon filled />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('stroke')).toBe('none');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe('M13 2 4 14h6l-1 8 9-12h-6l1-8z');
  });

  it('stays an outline by default', () => {
    const { container } = render(<ZapIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });
});
