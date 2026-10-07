import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FaqItem from '@/components/marketing/landing/FaqItem';

describe('FaqItem', () => {
  it('renders question and hides answer by default', () => {
    render(<FaqItem id="q1" question="What?" answer="Because." />);
    expect(screen.getByText('What?')).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands on click', () => {
    render(<FaqItem id="q1" question="What?" answer="Because." />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses on second click', () => {
    render(<FaqItem id="q1" question="What?" answer="Because." />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('carries no microdata: the FAQPage JSON-LD in FaqSection is the one description of the FAQ', () => {
    // Questions marked up here with no FAQPage around them were a second,
    // orphaned copy of what the JSON-LD already says.
    render(<FaqItem id="q1" question="What?" answer="Because." />);
    const wrapper = screen.getByTestId('faq-item-q1');
    expect(wrapper.querySelector('[itemscope], [itemprop], [itemtype]')).toBeNull();
    expect(wrapper.hasAttribute('itemtype')).toBe(false);
  });
});
