import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';

/** Guide components link through the locale-aware `Link`, which needs the intl provider. */
const render = (ui: ReactElement) => rtlRender(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
import GuideCard from '@/components/guides/GuideCard';

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
    render(<GuideCard slug="my-guide" frontmatter={fm} />);
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
        frontmatter={{ ...fm, heroComponent: 'does-not-exist' }}
      />,
    );
    expect(screen.getByText('My Guide')).toBeInTheDocument();
  });
});
