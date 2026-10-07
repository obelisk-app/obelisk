import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PingDot from '@/components/ui/animations/PingDot';
import PulseDot from '@/components/ui/animations/PulseDot';

describe('PingDot', () => {
  it('is the dot and its halo the voice pills drew by hand', () => {
    const { container } = render(<PingDot color="bg-amber-300" />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap.className).toBe('relative inline-flex h-1.5 w-1.5');
    expect(wrap).toHaveAttribute('aria-hidden', 'true');
    const [halo, dot] = Array.from(wrap.children) as HTMLElement[];
    expect(halo.className).toBe('absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 bg-amber-300');
    expect(dot.className).toBe('relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-300');
  });

  it('the room header dot: larger, a softer halo, extra classes on the wrapper', () => {
    const { container } = render(<PingDot color="bg-lc-green" size="sm" halo={50} className="shrink-0" />);
    const wrap = container.firstElementChild as HTMLElement;
    expect(wrap).toHaveClass('h-2', 'w-2', 'shrink-0');
    expect(wrap.firstElementChild).toHaveClass('opacity-50', 'bg-lc-green', 'animate-ping');
  });

  it('a settled state shows the still dot alone', () => {
    const { container } = render(<PingDot color="bg-emerald-300" ping={false} />);
    expect(container.querySelector('.animate-ping')).toBeNull();
    expect(container.firstElementChild?.children).toHaveLength(1);
  });
});

describe('PulseDot', () => {
  it('is the pulsing dot, decorative', () => {
    const { container } = render(<PulseDot color="bg-red-400" />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot.className).toBe('animate-pulse rounded-full h-2 w-2 bg-red-400');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
  });

  it('takes the small size and layout classes', () => {
    const { container } = render(<PulseDot color="bg-yellow-400" size="xs" className="mt-1.5 shrink-0" />);
    expect(container.firstElementChild).toHaveClass('h-1.5', 'w-1.5', 'bg-yellow-400', 'mt-1.5', 'shrink-0');
  });
});
