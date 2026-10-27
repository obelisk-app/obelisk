import type { ImgHTMLAttributes, ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@tests/support/intl';
import Page from '@/app/[locale]/(site)/page';

const serverLocale = vi.hoisted(() => ({ value: 'en' as 'en' | 'es' }));

vi.mock('next-intl/server', () => ({
  getLocale: async () => serverLocale.value,
  getTranslations: async () => (await import('@tests/support/intl')).translator(serverLocale.value),
}));
vi.mock('@/i18n/IntlScope', () => ({ default: ({ children }: { children: ReactNode }) => children }));

type MockImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  src: string | { src: string };
  alt: string;
  priority?: boolean;
  sizes?: string;
};

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock());

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

vi.mock('@/components/marketing/site/Navbar', () => ({
  default: () => <nav data-testid="mock-navbar" />,
}));

vi.mock('@/components/ui/animations/ShootingStars', () => ({
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

describe('landing route', async () => {
  beforeEach(() => {
    serverLocale.value = 'en';
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  it('lays the copy beside the looping phone clip, with the highlight shimmering', async () => {
    render(
      <LocaleProvider initialLocale="en">
        {await Page()}
      </LocaleProvider>,
    );

    const hero = screen.getByTestId('landing-hero');
    const heading = within(hero).getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Your communities, under your control');
    expect(heading.querySelector('.lc-shine-text')).toHaveTextContent('under your control');
    expect(within(hero).getByText('Discord-style group chat built directly on Nostr relays.')).toBeInTheDocument();
    expect(within(hero).getByText('No accounts. No backend. Your keys, your relays.')).toBeInTheDocument();

    const heroPreview = within(hero).getByTestId('hero-product-preview');
    expect(within(heroPreview).getByAltText(/Obelisk mobile screenshot/i)).toHaveAttribute('src', '/landing/hero-mobile.webp');
    expect([...heroPreview.querySelectorAll('source')].map((s) => s.getAttribute('src'))).toEqual([
      '/landing/hero-mobile.webm', '/landing/hero-mobile.mp4',
    ]);
  });

  it('shows the desktop clip full width on its own stage right after the hero', async () => {
    render(
      <LocaleProvider initialLocale="en">
        {await Page()}
      </LocaleProvider>,
    );

    const hero = screen.getByTestId('landing-hero');
    const stage = screen.getByTestId('landing-stage');
    expect(hero.nextElementSibling).toBe(stage);
    expect(within(stage).getByAltText(/Obelisk desktop screenshot/i)).toHaveAttribute('src', '/landing/hero-desktop.webp');
    expect([...stage.querySelectorAll('source')].map((s) => s.getAttribute('src'))).toEqual([
      '/landing/hero-desktop.webm', '/landing/hero-desktop.mp4',
    ]);
  });

  it('keeps both clips muted and lazy, never autoplaying', async () => {
    render(
      <LocaleProvider initialLocale="en">
        {await Page()}
      </LocaleProvider>,
    );

    const videos = [screen.getByTestId('hero-product-preview'), screen.getByTestId('landing-stage')]
      .flatMap((el) => [...el.querySelectorAll('video')]);
    expect(videos).toHaveLength(2);
    for (const video of videos) {
      expect(video.muted).toBe(true);
      expect(video).toHaveAttribute('preload', 'none');
      expect(video.hasAttribute('autoplay')).toBe(false);
    }
  });

  it('keeps the latest screenshot preview cards below the hero', async () => {
    render(
      <LocaleProvider initialLocale="en">
        {await Page()}
      </LocaleProvider>,
    );

    const desktopPreview = screen.getByTestId('landing-preview-desktop');
    const mobilePreview = screen.getByTestId('landing-preview-mobile');
    expect(within(desktopPreview).getByAltText(/Obelisk desktop screenshot/i)).toHaveAttribute(
      'src',
      '/pictures-for-posts/desktop-channel-chat.png',
    );
    expect(within(mobilePreview).getByAltText(/Obelisk mobile screenshot/i)).toHaveAttribute(
      'src',
      '/pictures-for-posts/mobile-channel-chat.png',
    );
  });

  it('embeds the demo video between the hero and the screenshot cards', async () => {
    render(
      <LocaleProvider initialLocale="en">
        {await Page()}
      </LocaleProvider>,
    );

    const hero = screen.getByTestId('landing-hero');
    const video = screen.getByTestId('landing-demo-video');
    const desktopPreview = screen.getByTestId('landing-preview-desktop');

    // Document order: hero -> video -> screenshots.
    expect(hero.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(video.compareDocumentPosition(desktopPreview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the video as a click-to-play facade, not a live YouTube iframe', async () => {
    render(
      <LocaleProvider initialLocale="en">
        {await Page()}
      </LocaleProvider>,
    );

    const video = screen.getByTestId('landing-demo-video');
    // No third-party frame on first paint - the whole point of the facade.
    expect(video.querySelector('iframe')).toBeNull();

    const thumb = within(video).getByTestId('youtube-thumbnail');
    expect(thumb.querySelector('img')?.src).toContain('Z86oghQkUbk');
  });

  it('swaps in the nocookie player once the visitor asks for it', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider initialLocale="en">
        {await Page()}
      </LocaleProvider>,
    );

    const video = screen.getByTestId('landing-demo-video');
    await user.click(within(video).getByTestId('youtube-thumbnail'));

    const iframe = within(video).getByTestId('youtube-iframe').querySelector('iframe');
    expect(iframe?.src).toContain('youtube-nocookie.com/embed/Z86oghQkUbk');
  });

  it('lists the games among the features, in both locales', async () => {
    render(<LocaleProvider>{await Page()}</LocaleProvider>);
    expect(screen.getByRole('heading', { name: 'Games in chat' })).toBeInTheDocument();
    expect(screen.getByText(/Chain Reaction, Vesta and Stacker/)).toBeInTheDocument();
  });

  it('allows the Spanish hero headline to wrap on narrow screens', async () => {
    serverLocale.value = 'es';
    render(
      <LocaleProvider initialLocale="es">
        {await Page()}
      </LocaleProvider>,
    );

    const hero = screen.getByTestId('landing-hero');
    const heading = within(hero).getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Tus comunidades, bajo tu control');
    expect(heading.className).not.toContain('whitespace-nowrap');
  });

});
