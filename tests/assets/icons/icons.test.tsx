import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronUpIcon, EyeIcon, EyeOffIcon, ZapIcon } from '@/assets/icons';

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
  it('fills the one bolt drawing when filled, keeping its rounded outline', () => {
    const outline = render(<ZapIcon />).container.querySelector('path')!.getAttribute('d');
    const svg = render(<ZapIcon filled />).container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.querySelector('path')!.getAttribute('d')).toBe(outline);
  });

  it('lets a caller fill it without the filled prop', () => {
    const svg = render(<ZapIcon fill="currentColor" />).container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
  });

  it('stays an outline by default', () => {
    const { container } = render(<ZapIcon />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
  });
});

describe('IconSvg, the frame every icon draws on', () => {
  it('leaves sizing to the stylesheet when size is null', () => {
    const svg = render(<CheckIcon size={null} className="h-5 w-5" />).container.querySelector('svg')!;
    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
    expect(svg).toHaveAttribute('class', 'h-5 w-5');
  });

  it('is decorative unless named: a title or an aria-label makes it an image and drops aria-hidden', () => {
    const plain = render(<CheckIcon />).container.querySelector('svg')!;
    expect(plain).toHaveAttribute('aria-hidden', 'true');
    expect(plain.hasAttribute('role')).toBe(false);

    const titled = render(<CheckIcon title="Done" />).container.querySelector('svg')!;
    expect(titled.hasAttribute('aria-hidden')).toBe(false);
    expect(titled).toHaveAttribute('role', 'img');
    expect(titled.querySelector('title')?.textContent).toBe('Done');

    const labelled = render(<CheckIcon aria-label="Done" />).container.querySelector('svg')!;
    expect(labelled.hasAttribute('aria-hidden')).toBe(false);
  });

  it('lets a caller override any default, even back to the SVG initial value', () => {
    const svg = render(<ChevronLeftIcon strokeLinejoin="miter" fill="white" />).container.querySelector('svg')!;
    expect(svg).toHaveAttribute('stroke-linejoin', 'miter');
    expect(svg).toHaveAttribute('fill', 'white');
  });
});
