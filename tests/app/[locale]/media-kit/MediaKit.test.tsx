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
  it('renders its labels and the brand copy in the page language only', () => {
    render(
      <LocaleProvider initialLocale="es">
        <MediaKit />
      </LocaleProvider>,
    );
    expect(screen.getByText(/^Logos, banners, íconos, paleta y textos/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Colores' })).toHaveAttribute('href', '#colors');
    expect(screen.getByText('Logo de Obelisk (PNG)')).toBeInTheDocument();
    expect(screen.getByText('Pitch corto')).toBeInTheDocument();
    expect(screen.getByText('Eslogan')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copiar' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Descargar PNG' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Obelisk es un chat grupal estilo Discord/)).toBeInTheDocument();
    // One page, one language: no English pitch or tagline beside the Spanish one.
    expect(screen.queryByText(/^Obelisk is a Discord-style group chat/)).toBeNull();
    expect(screen.queryAllByText('Group chat powered by Nostr identity')).toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\((EN|ES)\)|\b(EN|ES) - /);
  });

  it('serves Portuguese pitches, taglines and embed snippets on the Portuguese page', () => {
    render(
      <LocaleProvider initialLocale="pt">
        <MediaKit />
      </LocaleProvider>,
    );
    expect(screen.getByText(/^Obelisk é um chat em grupo no estilo Discord/)).toBeInTheDocument();
    expect(screen.getByText(/^Obelisk é um aplicativo de chat em grupo/)).toBeInTheDocument();
    expect(screen.getAllByText('Chat em grupo com identidade Nostr').length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('content="Obelisk - Chat em grupo com identidade Nostr"');
    expect(document.body.textContent).toContain('Com tecnologia Obelisk');
    expect(screen.queryByText(/^Obelisk es un chat grupal/)).toBeNull();
    expect(screen.queryByText(/^Obelisk is a Discord-style group chat/)).toBeNull();
  });
});
