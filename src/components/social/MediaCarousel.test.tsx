import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MediaCarousel from './MediaCarousel';
import { LocaleProvider } from '@/i18n/context';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const image = (n: number) => ({ url: `https://example.com/${n}.jpg` });

describe('MediaCarousel', () => {
  it('renders a lone image plainly — one slide is not a carousel', () => {
    renderLocalized(<MediaCarousel items={[image(1)]} />);
    expect(screen.queryByTestId('media-carousel')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
  });

  it('renders nothing for an empty set', () => {
    const { container } = renderLocalized(<MediaCarousel items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('puts a set in one swipeable frame instead of stacking them', () => {
    // Stacked, a four-image post owned the viewport and everything after it
    // was a scroll away.
    renderLocalized(<MediaCarousel items={[image(1), image(2), image(3), image(4)]} />);
    expect(screen.getByTestId('media-carousel')).toBeInTheDocument();
    expect(screen.getAllByTestId('media-carousel-dot')).toHaveLength(4);
    expect(screen.getByTestId('media-carousel-count')).toHaveTextContent('1/4');
  });

  it('snaps, so the swipe is the browser’s rather than a JS slider', () => {
    renderLocalized(<MediaCarousel items={[image(1), image(2)]} />);
    expect(screen.getByTestId('media-carousel-track').className).toContain('snap-x');
  });

  it('follows the scroll position', () => {
    renderLocalized(<MediaCarousel items={[image(1), image(2), image(3)]} />);
    const track = screen.getByTestId('media-carousel-track');
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(track, 'scrollLeft', { value: 600, configurable: true });

    fireEvent.scroll(track);
    expect(screen.getByTestId('media-carousel-count')).toHaveTextContent('3/3');
    expect(screen.getAllByTestId('media-carousel-dot')[2]).toHaveAttribute('aria-current', 'true');
  });

  it('rounds to the nearest slide mid-swipe', () => {
    // Flooring would leave the dots pointing at the slide you just left.
    renderLocalized(<MediaCarousel items={[image(1), image(2)]} />);
    const track = screen.getByTestId('media-carousel-track');
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(track, 'scrollLeft', { value: 170, configurable: true });

    fireEvent.scroll(track);
    expect(screen.getByTestId('media-carousel-count')).toHaveTextContent('2/2');
  });

  it('jumps to a slide from its dot', () => {
    renderLocalized(<MediaCarousel items={[image(1), image(2)]} />);
    const track = screen.getByTestId('media-carousel-track');
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    track.scrollTo = vi.fn();

    fireEvent.click(screen.getAllByTestId('media-carousel-dot')[1]);
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });
  });

  it('reserves layout from imeta dimensions so the feed does not jump', () => {
    renderLocalized(<MediaCarousel items={[{ url: 'https://example.com/a.jpg', width: 800, height: 400 }]} />);
    expect(document.querySelector('img')).toHaveStyle({ aspectRatio: '800/400' });
  });

  it('opens a lightbox on click, which a picture note never had', () => {
    // The markdown image path had zoom; a kind-20 note rendered through
    // here had no way to be opened at all.
    renderLocalized(<MediaCarousel items={[image(1), image(2)]} />);
    fireEvent.click(screen.getAllByTestId('carousel-image')[1]);

    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    // Opened on the image that was clicked, not the first one.
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('renders the lightbox outside the note, which clips fixed children', () => {
    // `.note-card` sets `contain: layout paint`, which makes it the
    // containing block for `position: fixed` — the overlay was laid out
    // against the card and clipped by it.
    renderLocalized(<MediaCarousel items={[image(1), image(2)]} />);
    fireEvent.click(screen.getAllByTestId('carousel-image')[0]);
    expect(screen.getByTestId('lightbox').parentElement).toBe(document.body);
  });

  it('skips videos when building the zoomable set', () => {
    renderLocalized(<MediaCarousel items={[
      { url: 'https://example.com/a.mp4', mimeType: 'video/mp4' },
      image(2),
    ]} />);
    fireEvent.click(screen.getByTestId('carousel-image'));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    // One still, so no "1 / 2" counter claiming a video is in the set.
    expect(screen.queryByText('1 / 2')).not.toBeInTheDocument();
  });

  it('renders a video slide with controls', () => {
    renderLocalized(<MediaCarousel items={[{ url: 'https://example.com/a.mp4', mimeType: 'video/mp4' }]} />);
    expect(document.querySelector('video')).toHaveAttribute('controls');
  });
});

describe('video slides', () => {
  const render1 = (item: Record<string, unknown>) => render(<MediaCarousel items={[item as never]} />);

  it('uses the imeta poster frame so the card shows something', () => {
    // Without a poster a video note is a grey box reading 0:00 — nothing to
    // look at until you press play.
    render1({ url: 'https://v.example/a.mp4', mimeType: 'video/mp4', poster: 'https://v.example/a.jpg' });
    expect(screen.getByTestId('carousel-video')).toHaveAttribute('poster', 'https://v.example/a.jpg');
  });

  it('skips the metadata round trip when it already has a poster', () => {
    render1({ url: 'https://v.example/a.mp4', mimeType: 'video/mp4', poster: 'https://v.example/a.jpg' });
    expect(screen.getByTestId('carousel-video')).toHaveAttribute('preload', 'none');
  });

  it('still asks for metadata when there is no poster', () => {
    render1({ url: 'https://v.example/a.mp4', mimeType: 'video/mp4' });
    const video = screen.getByTestId('carousel-video');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).not.toHaveAttribute('poster');
  });

  it('recognises a video by extension when the publisher wrote no mime type', () => {
    // These were falling through to <img> and rendering as a broken image.
    render1({ url: 'https://v.example/clip.webm' });
    expect(screen.getByTestId('carousel-video')).toBeInTheDocument();
  });

  it('does not mistake an image url for a video', () => {
    render1({ url: 'https://v.example/photo.jpg' });
    expect(screen.queryByTestId('carousel-video')).toBeNull();
    expect(screen.getByTestId('carousel-image')).toBeInTheDocument();
  });

  it('is not fooled by a query string after the extension', () => {
    render1({ url: 'https://v.example/clip.mp4?token=abc' });
    expect(screen.getByTestId('carousel-video')).toBeInTheDocument();
  });
});
