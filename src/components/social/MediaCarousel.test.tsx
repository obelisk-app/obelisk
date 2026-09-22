import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MediaCarousel from './MediaCarousel';

const image = (n: number) => ({ url: `https://example.com/${n}.jpg` });

describe('MediaCarousel', () => {
  it('renders a lone image plainly — one slide is not a carousel', () => {
    render(<MediaCarousel items={[image(1)]} />);
    expect(screen.queryByTestId('media-carousel')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('src', 'https://example.com/1.jpg');
  });

  it('renders nothing for an empty set', () => {
    const { container } = render(<MediaCarousel items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('puts a set in one swipeable frame instead of stacking them', () => {
    // Stacked, a four-image post owned the viewport and everything after it
    // was a scroll away.
    render(<MediaCarousel items={[image(1), image(2), image(3), image(4)]} />);
    expect(screen.getByTestId('media-carousel')).toBeInTheDocument();
    expect(screen.getAllByTestId('media-carousel-dot')).toHaveLength(4);
    expect(screen.getByTestId('media-carousel-count')).toHaveTextContent('1/4');
  });

  it('snaps, so the swipe is the browser’s rather than a JS slider', () => {
    render(<MediaCarousel items={[image(1), image(2)]} />);
    expect(screen.getByTestId('media-carousel-track').className).toContain('snap-x');
  });

  it('follows the scroll position', () => {
    render(<MediaCarousel items={[image(1), image(2), image(3)]} />);
    const track = screen.getByTestId('media-carousel-track');
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(track, 'scrollLeft', { value: 600, configurable: true });

    fireEvent.scroll(track);
    expect(screen.getByTestId('media-carousel-count')).toHaveTextContent('3/3');
    expect(screen.getAllByTestId('media-carousel-dot')[2]).toHaveAttribute('aria-current', 'true');
  });

  it('rounds to the nearest slide mid-swipe', () => {
    // Flooring would leave the dots pointing at the slide you just left.
    render(<MediaCarousel items={[image(1), image(2)]} />);
    const track = screen.getByTestId('media-carousel-track');
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(track, 'scrollLeft', { value: 170, configurable: true });

    fireEvent.scroll(track);
    expect(screen.getByTestId('media-carousel-count')).toHaveTextContent('2/2');
  });

  it('jumps to a slide from its dot', () => {
    render(<MediaCarousel items={[image(1), image(2)]} />);
    const track = screen.getByTestId('media-carousel-track');
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    track.scrollTo = vi.fn();

    fireEvent.click(screen.getAllByTestId('media-carousel-dot')[1]);
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });
  });

  it('reserves layout from imeta dimensions so the feed does not jump', () => {
    render(<MediaCarousel items={[{ url: 'https://example.com/a.jpg', width: 800, height: 400 }]} />);
    expect(document.querySelector('img')).toHaveStyle({ aspectRatio: '800/400' });
  });

  it('renders a video slide with controls', () => {
    render(<MediaCarousel items={[{ url: 'https://example.com/a.mp4', mimeType: 'video/mp4' }]} />);
    expect(document.querySelector('video')).toHaveAttribute('controls');
  });
});
