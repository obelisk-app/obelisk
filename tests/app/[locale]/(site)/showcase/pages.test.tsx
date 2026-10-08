import SiteLayout from '@/app/[locale]/(site)/layout';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DesktopPage from '@/app/[locale]/(site)/desktop/page';
import MobilePage from '@/app/[locale]/(site)/mobile/page';
import showcase from '@/i18n/messages/en/showcase.json';

vi.mock('@/components/marketing/site/Navbar', () => ({ default: () => <nav /> }));
vi.mock('@/components/marketing/site/Footer', () => ({ default: () => <footer /> }));
vi.mock('@/components/ui/animations/ShootingStars', () => ({ default: () => null }));

describe('server-rendered app tours', () => {
  beforeEach(() => vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} }));
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ['desktop', DesktopPage, 3],
    ['mobile', MobilePage, 4],
  ] as const)('%s keeps its content and explicit app navigation', async (kind, Page, count) => {
    render(<SiteLayout>{await Page()}</SiteLayout>);
    const copy = showcase[kind];
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(copy.hero.title);
    expect(screen.getAllByRole('img')).toHaveLength(count);
    expect(screen.getByRole('link', { name: copy.hero.cta })).toHaveAttribute('href', '/app');
    expect(screen.getByRole('link', { name: copy.cta.button })).toHaveAttribute('href', '/app');
  });
});
