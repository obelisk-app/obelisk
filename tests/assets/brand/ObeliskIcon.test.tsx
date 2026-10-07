import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ObeliskIcon from '@/assets/brand/ObeliskIcon';
import ObeliskTwoToneMark from '@/assets/brand/ObeliskTwoToneMark';

describe('ObeliskIcon', () => {
  it('draws the mark as a silhouette with the left face cut out', () => {
    const { container } = render(<ObeliskIcon />);
    const svg = container.querySelector('svg')!;
    const path = svg.querySelector('path')!;

    // evenodd + a second subpath is what makes the slim left face hollow the
    // way the shipped icon and favicon do; a single filled subpath would put
    // the deprecated solid-face artwork back.
    expect(svg).toHaveAttribute('fill-rule', 'evenodd');
    expect(path.getAttribute('d')!.match(/M /g)).toHaveLength(2);
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes styling through to the svg', () => {
    const { container } = render(<ObeliskIcon className="w-12 text-lc-green" />);
    expect(container.querySelector('svg')).toHaveClass('w-12', 'text-lc-green');
  });
});

describe('ObeliskTwoToneMark', () => {
  it('takes the fill it is given, or paints each face', () => {
    const plain = render(<ObeliskTwoToneMark className="login-mark" fill="currentColor" />).container.querySelector('svg')!;
    const [left, right] = plain.querySelectorAll('path');
    expect(plain).toHaveAttribute('fill', 'currentColor');
    expect(left).toHaveAttribute('opacity', '0.7');
    expect(left.hasAttribute('fill')).toBe(false);
    expect(right.hasAttribute('fill')).toBe(false);

    const painted = render(<ObeliskTwoToneMark leftFill="#a3a3a3" rightFill="#fafafa" />).container.querySelectorAll('path');
    expect(painted[0]).toHaveAttribute('fill', '#a3a3a3');
    expect(painted[1]).toHaveAttribute('fill', '#fafafa');
  });
});
