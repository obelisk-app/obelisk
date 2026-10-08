import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Section from '@/components/ui/layout/Section';

describe('Section', () => {
  it('preserves anchors, content and introductory article typography', () => {
    render(<Section id="topic" title="Topic" description="Introduction" data-testid="section"><span>Content</span></Section>);
    const section = screen.getByTestId('section');
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveAttribute('id', 'topic');
    expect(section).toHaveClass('scroll-mt-24');
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('sm:text-3xl');
    expect(screen.getByText('Introduction').tagName).toBe('P');
    expect(section).toContainElement(screen.getByText('Content'));
  });

  it('supports prose sections and independent heading levels without an empty description', () => {
    render(<Section title="Details" variant="prose" headingAs="h3" className="extra" data-testid="section">Body</Section>);
    expect(screen.getByRole('heading', { level: 3 })).toHaveClass('text-xl', 'font-bold');
    expect(screen.getByTestId('section')).toHaveClass('mt-10', 'leading-7', 'extra');
    expect(screen.getByTestId('section').querySelector('p')).toBeNull();
  });
});
