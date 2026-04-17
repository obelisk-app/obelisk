import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import Footer from './Footer';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('Footer', () => {
  it('renders the 4 guide links using the context locale', () => {
    render(
      <LocaleProvider initialLocale="en">
        <Footer />
      </LocaleProvider>,
    );
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/guides/en/what-is-obelisk');
    expect(links).toContain('/guides/en/how-obelisk-works');
    expect(links).toContain('/guides/en/web-of-trust');
    expect(links).toContain('/guides/en/future-nostr-relays');
    expect(links).toContain('/guides/en');
  });

  it('respects localeOverride prop for URL-localized pages', () => {
    render(
      <LocaleProvider initialLocale="en">
        <Footer localeOverride="es" />
      </LocaleProvider>,
    );
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/guides/es/what-is-obelisk');
    expect(links).not.toContain('/guides/en/what-is-obelisk');
  });

  it('includes product, community, and FAQ links', () => {
    render(
      <LocaleProvider initialLocale="en">
        <Footer />
      </LocaleProvider>,
    );
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/chat');
    expect(links).toContain('/#faq');
    expect(links).toContain('https://github.com/Fabricio333/obelisk');
    expect(links).toContain('https://lacrypta.ar');
  });
});
