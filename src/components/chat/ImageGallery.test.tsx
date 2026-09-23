import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/nostr-bridge', () => ({
  useMediaPacks: () => ({}),
  useMyMediaFavorites: () => ({ items: [] }),
}));

vi.mock('@/components/media/MediaLibraryModal', () => ({ default: () => null }));

import ImageGallery from './ImageGallery';
import { LocaleProvider } from '@/i18n/context';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/${i}.jpg`);

describe('ImageGallery lightbox', () => {
  it('opens on click', () => {
    renderLocalized(<ImageGallery urls={urls(1)} />);
    fireEvent.click(document.querySelector('img')!.closest('button') ?? document.querySelector('img')!);
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
  });

  it('renders outside the note card, which clips fixed children', () => {
    // `.note-card` carries `contain: layout paint`, so it is the containing
    // block for `position: fixed`: in a feed note the overlay was laid out
    // against the card and clipped by it, and clicking an image looked
    // like it did nothing. In chat there is no such ancestor, which is why
    // the same code worked there.
    renderLocalized(
      <div className="note-card" style={{ contain: 'layout paint' }}>
        <ImageGallery urls={urls(1)} />
      </div>,
    );
    fireEvent.click(document.querySelector('img')!.closest('button') ?? document.querySelector('img')!);
    expect(screen.getByTestId('lightbox').parentElement).toBe(document.body);
  });

  it('closes on Escape', () => {
    renderLocalized(<ImageGallery urls={urls(2)} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
  });
});
