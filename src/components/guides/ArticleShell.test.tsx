import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ArticleShell from './ArticleShell';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('ArticleShell', () => {
  const fm = {
    title: 'Hello',
    description: 'intro',
    heroComponent: 'wot',
    publishedAt: '2026-04-01',
    updatedAt: '2026-04-10',
    tags: ['a', 'b'],
  };

  it('renders title, description, tags, and body', () => {
    render(
      <ArticleShell
        frontmatter={fm}
        locale="en"
        slug="hello"
        readMinutes={5}
        backHref="/guides/en"
        backLabel="Back"
        readTimeLabel="min read"
        updatedLabel="Updated"
      >
        <p data-testid="body">body text</p>
      </ArticleShell>,
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('intro')).toBeInTheDocument();
    expect(screen.getByText('#a')).toBeInTheDocument();
    expect(screen.getByText(/5 min read/)).toBeInTheDocument();
    expect(screen.getByTestId('body')).toHaveTextContent('body text');
  });

  it('does not render a per-article locale switcher', () => {
    render(
      <ArticleShell
        frontmatter={fm}
        locale="en"
        slug="hello"
        readMinutes={5}
        backHref="/guides/en"
        backLabel="Back"
        readTimeLabel="min read"
        updatedLabel="Updated"
      >
        <p>body</p>
      </ArticleShell>,
    );
    expect(screen.queryByText(/Leer en español/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Read in English/i)).not.toBeInTheDocument();
  });
});
