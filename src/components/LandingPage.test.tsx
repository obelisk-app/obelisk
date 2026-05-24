import type { ImgHTMLAttributes } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import LandingPage from './LandingPage';

const pushMock = vi.fn();

type MockImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src: string | { src: string };
  alt: string;
  priority?: boolean;
  sizes?: string;
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt, priority, sizes, ...props }: MockImageProps) => {
    void priority;
    void sizes;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={typeof src === 'string' ? src : src.src} alt={alt} {...props} />
    );
  },
}));

vi.mock('@/components/Navbar', () => ({
  default: () => <nav data-testid="mock-navbar" />,
}));

vi.mock('@/components/ShootingStars', () => ({
  default: () => <div data-testid="mock-shooting-stars" />,
}));


class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

describe('LandingPage hero', () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  it('puts the product preview directly inside the hero', () => {
    render(
      <LocaleProvider initialLocale="en">
        <LandingPage />
      </LocaleProvider>,
    );

    const hero = screen.getByTestId('landing-hero');
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent('Tus comunidades, bajo tu control');
    expect(hero.querySelector('.animate-orbit')).not.toBeNull();
    expect(within(hero).getByText('Discord-style group chat built directly on Nostr relays.')).toBeInTheDocument();
    expect(within(hero).getByText('No accounts. No backend. Your keys, your relays.')).toBeInTheDocument();

    const preview = within(hero).getByTestId('hero-product-preview');
    expect(within(preview).getByAltText(/Obelisk desktop screenshot/i)).toHaveAttribute(
      'src',
      '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
    );
    expect(within(preview).getByAltText(/Obelisk mobile screenshot/i)).toHaveAttribute(
      'src',
      '/pictures-for-posts/mobile-server-and-channels-view.png',
    );
  });

  it('keeps the Spanish hero headline as one line', () => {
    render(
      <LocaleProvider initialLocale="es">
        <LandingPage />
      </LocaleProvider>,
    );

    const hero = screen.getByTestId('landing-hero');
    const heading = within(hero).getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Tus comunidades, bajo tu control');
    expect(heading.className).toContain('whitespace-nowrap');
  });

});
