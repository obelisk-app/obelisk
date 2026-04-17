import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FAQItem from './FAQItem';

describe('FAQItem', () => {
  it('renders question and hides answer by default', () => {
    render(<FAQItem id="q1" question="What?" answer="Because." />);
    expect(screen.getByText('What?')).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands on click', () => {
    render(<FAQItem id="q1" question="What?" answer="Because." />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('collapses on second click', () => {
    render(<FAQItem id="q1" question="What?" answer="Because." />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('emits schema.org microdata attributes', () => {
    render(<FAQItem id="q1" question="What?" answer="Because." />);
    const wrapper = screen.getByTestId('faq-item-q1');
    expect(wrapper.getAttribute('itemtype')).toBe('https://schema.org/Question');
    expect(wrapper.querySelector('[itemprop="name"]')?.textContent).toBe('What?');
    expect(wrapper.querySelector('[itemprop="text"]')?.textContent).toContain('Because.');
  });
});
