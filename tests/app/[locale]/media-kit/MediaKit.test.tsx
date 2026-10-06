import { describe, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({ toPng: vi.fn() }));
vi.mock('next/image', () => ({ default: () => null }));

import { render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import MediaKit, { ASSETS } from '@/app/[locale]/media-kit/MediaKit';

describe('media kit assets', () => {
  it('no longer offers the deprecated /obelisk.png artwork', () => {
    expect(ASSETS.map((asset) => asset.src)).not.toContain('/obelisk.png');
  });

  it('serves the shipped icon as the downloadable logo', () => {
    const logo = ASSETS.find((asset) => asset.labelKey === 'mediaKit.asset.logo');
    expect(logo?.src).toBe('/icon-512.png');
    expect(logo?.download).toBe('obelisk-logo.png');
  });

  it('lists every asset once', () => {
    const sources = ASSETS.map((asset) => asset.src);
    expect(new Set(sources).size).toBe(sources.length);
  });
});

describe('media kit page', () => {
  it('renders its labels in the page language and the brand copy as it is', () => {
    render(
      <LocaleProvider initialLocale="es">
        <MediaKit />
      </LocaleProvider>,
    );
    expect(screen.getByText(/^Logos, banners, íconos, paleta y textos/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colores' })).toHaveAttribute('href', '#colors');
    expect(screen.getByText('Logo de Obelisk (PNG)')).toBeInTheDocument();
    expect(screen.getByText('ES - Pitch corto')).toBeInTheDocument();
    expect(screen.getByText('Eslogan (EN)')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copiar' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Descargar PNG' }).length).toBeGreaterThan(0);
    // The pitch itself is a deliverable: the English one stays English.
    expect(screen.getByText(/^Obelisk is a Discord-style group chat/)).toBeInTheDocument();
  });
});
