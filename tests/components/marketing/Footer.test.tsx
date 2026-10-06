import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import Footer from '@/components/marketing/Footer';

describe('Footer', () => {
  it('renders the 4 guide links using the context locale', () => {
    render(
      <LocaleProvider initialLocale="en">
        <Footer />
      </LocaleProvider>,
    );
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/guides/what-is-obelisk');
    expect(links).toContain('/guides/how-obelisk-works');
    expect(links).toContain('/guides/web-of-trust');
    expect(links).toContain('/guides/future-nostr-relays');
    expect(links).toContain('/guides');
  });

  it('links stay in the language being read: Spanish links carry /es', () => {
    render(
      <LocaleProvider initialLocale="es">
        <Footer />
      </LocaleProvider>,
    );
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/es/guides/what-is-obelisk');
    expect(links).toContain('/es/guides');
    expect(links).toContain('/es/app');
    expect(links).not.toContain('/guides/what-is-obelisk');
    // External links are left alone.
    expect(links).toContain('https://lacrypta.ar');
  });

  it('includes product, community, legal, and FAQ links', () => {
    render(
      <LocaleProvider initialLocale="en">
        <Footer />
      </LocaleProvider>,
    );
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/app');
    expect(links).toContain('/#faq');
    expect(links).toContain('/help');
    expect(links).toContain('https://github.com/obelisk-app/obelisk');
    expect(links).toContain('https://lacrypta.ar');
    expect(links).toContain('https://github.com/obelisk-app/obelisk/blob/main/LICENSE');
    expect(links).toContain('https://github.com/obelisk-app/obelisk/blob/main/ABUSE.md');
    expect(links).toContain('https://github.com/obelisk-app/obelisk/blob/main/SECURITY.md');
    expect(screen.getByText(/© \d{4} Fabricio Acosta · AGPL-3.0/)).toBeInTheDocument();
  });
});
