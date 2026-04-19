import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GuideCard from './GuideCard';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('GuideCard', () => {
  const fm = {
    title: 'My Guide',
    description: 'Short description.',
    heroComponent: 'wot',
    publishedAt: '2026-04-01',
    updatedAt: '2026-04-01',
    tags: ['alpha', 'beta'],
  };

  it('renders title, description, tags, and links to the article', () => {
    render(<GuideCard slug="my-guide" locale="en" frontmatter={fm} />);
    expect(screen.getByText('My Guide')).toBeInTheDocument();
    expect(screen.getByText('Short description.')).toBeInTheDocument();
    expect(screen.getByText('#alpha')).toBeInTheDocument();
    const link = screen.getByTestId('guide-card-my-guide') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/guides/my-guide');
  });

  it('falls back to placeholder when heroComponent is unknown', () => {
    render(
      <GuideCard
        slug="x"
        locale="es"
        frontmatter={{ ...fm, heroComponent: 'does-not-exist' }}
      />,
    );
    expect(screen.getByText('My Guide')).toBeInTheDocument();
  });
});
