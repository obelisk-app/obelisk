import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Reveal from '@/components/ui/animations/Reveal';

let reveal: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
class MockIntersectionObserver {
  constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { reveal = cb; }
  observe = vi.fn();
  disconnect = vi.fn();
}

describe('Reveal', () => {
  beforeEach(() => { vi.stubGlobal('IntersectionObserver', MockIntersectionObserver); });
  afterEach(() => { vi.unstubAllGlobals(); reveal = null; });

  it('is a section hidden until it scrolls into view, then fades up', () => {
    render(<Reveal id="s" className="py-24 px-6" data-testid="sec"><p>x</p></Reveal>);
    const sec = screen.getByTestId('sec');
    expect(sec.tagName).toBe('SECTION');
    expect(sec).toHaveAttribute('id', 's');
    expect(sec.className).toBe('py-24 px-6 opacity-0');
    act(() => reveal?.([{ isIntersecting: true }]));
    expect(sec.className).toBe('py-24 px-6 animate-fade-in-up');
  });

  it('renders the element it is asked for, with its attributes', () => {
    render(<Reveal as="article" className="relative" itemScope itemType="https://schema.org/ImageObject" data-testid="row" />);
    const row = screen.getByTestId('row');
    expect(row.tagName).toBe('ARTICLE');
    expect(row).toHaveAttribute('itemtype', 'https://schema.org/ImageObject');
    expect(row.className).toBe('relative opacity-0');
  });
});
