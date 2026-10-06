import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import HelpPage from '@/app/[locale]/help/page';

vi.mock('@/components/marketing/Navbar', () => ({ default: () => <nav>Obelisk</nav> }));
vi.mock('@/components/marketing/Footer', () => ({ default: () => <footer /> }));

describe('HelpPage', () => {
  it('links each help topic and the guide index in the active locale', () => {
    render(
      <LocaleProvider initialLocale="es">
        <HelpPage />
      </LocaleProvider>,
    );

    expect(screen.getByRole('heading', { name: '¿Cómo podemos ayudarte?' })).toBeInTheDocument();
    expect(screen.getByTestId('help-topic-what-is-obelisk')).toHaveAttribute(
      'href',
      '/es/guides/what-is-obelisk',
    );
    expect(screen.getByTestId('help-topic-local-data')).toHaveAttribute('href', '/es/help/local-data');
    expect(screen.getByRole('link', { name: 'Ver todas las guías →' })).toHaveAttribute(
      'href',
      '/es/guides',
    );
  });
});
