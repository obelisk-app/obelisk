import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
  });
});

vi.mock('@/components/media/library/MediaLibraryModal', () => ({ default: () => null }));

import ImageGallery from '@/components/chat/gallery/ImageGallery';
import { LocaleProvider } from '@tests/support/intl';

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

  it('shows the grabbing cursor for the whole drag, from mousedown to mouseup', () => {
    // The drag flag used to live only in a ref, so pressing the mouse on a
    // zoomed image did not re-render: the cursor stayed "grab" until the
    // pointer moved, and stayed "grabbing" after release until something
    // else re-rendered the lightbox.
    renderLocalized(<ImageGallery urls={urls(1)} />);
    fireEvent.click(document.querySelector('img')!.closest('button') ?? document.querySelector('img')!);
    const viewport = screen.getByTestId('lightbox-viewport');

    expect(viewport.style.cursor).toBe('zoom-in');
    fireEvent.wheel(viewport, { deltaY: -500 });
    expect(viewport.style.cursor).toBe('grab');

    fireEvent.mouseDown(viewport, { clientX: 10, clientY: 10 });
    expect(viewport.style.cursor).toBe('grabbing');

    fireEvent.mouseUp(screen.getByTestId('lightbox'));
    expect(viewport.style.cursor).toBe('grab');
  });

  it('resets zoom when the shown image changes', () => {
    renderLocalized(<ImageGallery urls={urls(2)} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    const viewport = screen.getByTestId('lightbox-viewport');
    fireEvent.wheel(viewport, { deltaY: -500 });
    expect(viewport.style.cursor).toBe('grab');

    fireEvent.click(screen.getByTestId('lightbox-next'));
    expect(screen.getByTestId('lightbox-viewport').style.cursor).toBe('zoom-in');
  });
});

describe('ImageGallery layout', () => {
  it('renders nothing for no images', () => {
    const { container } = renderLocalized(<ImageGallery urls={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('one image keeps its aspect; a broken one hides itself', () => {
    renderLocalized(<ImageGallery urls={urls(1)} wide />);
    const gallery = screen.getByTestId('image-gallery');
    expect(gallery).toHaveAttribute('data-count', '1');
    expect(gallery).toHaveClass('w-full');
    const img = gallery.querySelector('img')!;
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
  });

  it('two images sit side by side at 2:1', () => {
    renderLocalized(<ImageGallery urls={urls(2)} />);
    const gallery = screen.getByTestId('image-gallery');
    expect(gallery).toHaveClass('grid-cols-2', 'grid-rows-1', 'max-w-sm');
    expect(gallery.style.aspectRatio).toBe('2 / 1');
    expect(screen.getAllByTestId('gallery-tile')).toHaveLength(2);
  });

  it('three images: the first spans both rows', () => {
    renderLocalized(<ImageGallery urls={urls(3)} />);
    const tiles = screen.getAllByTestId('gallery-tile');
    expect(tiles[0]).toHaveClass('row-span-2');
    expect(tiles[1]).not.toHaveClass('row-span-2');
    expect(screen.getByTestId('image-gallery')).toHaveClass('grid-rows-2');
  });

  it('more than four: four tiles, the last says how many more, and a broken tile hides', () => {
    renderLocalized(<ImageGallery urls={urls(6)} />);
    const tiles = screen.getAllByTestId('gallery-tile');
    expect(tiles).toHaveLength(4);
    expect(screen.getByTestId('overflow-overlay')).toHaveTextContent('+2');
    expect(tiles[3]).toContainElement(screen.getByTestId('overflow-overlay'));
    const img = tiles[1].querySelector('img')!;
    fireEvent.error(img);
    expect(img.style.display).toBe('none');
  });

  it('a tile opens the lightbox on its image; prev and next wrap; the counter follows', () => {
    renderLocalized(<ImageGallery urls={urls(3)} />);
    fireEvent.click(screen.getAllByTestId('gallery-tile')[2]);
    expect(screen.getByTestId('lightbox')).toHaveTextContent('3 / 3');
    fireEvent.click(screen.getByTestId('lightbox-next'));
    expect(screen.getByTestId('lightbox')).toHaveTextContent('1 / 3');
    fireEvent.click(screen.getByTestId('lightbox-prev'));
    expect(screen.getByTestId('lightbox')).toHaveTextContent('3 / 3');
  });

  it('the close button and a backdrop click close the lightbox; a click on the image does not', () => {
    renderLocalized(<ImageGallery urls={urls(2)} />);
    fireEvent.click(screen.getAllByTestId('gallery-tile')[0]);
    fireEvent.click(screen.getByTestId('lightbox-viewport'));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lightbox'));
    expect(screen.queryByTestId('lightbox')).toBeNull();
    fireEvent.click(screen.getAllByTestId('gallery-tile')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('lightbox')).toBeNull();
  });
});
