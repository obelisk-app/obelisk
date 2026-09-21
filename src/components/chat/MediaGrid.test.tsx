import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';
import MediaGrid, { type MediaItem } from './MediaGrid';

const items = (count: number): MediaItem[] => Array.from({ length: count }, (_, i) => ({
  key: `k${i}`,
  url: `https://example.com/${i}.jpg`,
}));

const renderGrid = (list: MediaItem[], onOpen = vi.fn()) => {
  render(<LocaleProvider initialLocale="en"><MediaGrid items={list} onOpen={onOpen} /></LocaleProvider>);
  return onOpen;
};

describe('MediaGrid', () => {
  it('renders one tile per item', () => {
    renderGrid(items(5));
    expect(screen.getAllByTestId('profile-media-tile')).toHaveLength(5);
  });

  it('opens the item that was clicked', () => {
    const onOpen = renderGrid(items(2));
    fireEvent.click(screen.getAllByTestId('profile-media-tile')[1]);
    expect(onOpen).toHaveBeenCalledWith('https://example.com/1.jpg');
  });

  it('breaks the grid up with a larger tile', () => {
    // A uniform wall of thumbnails is what this replaced.
    renderGrid(items(10));
    const featured = screen.getAllByTestId('profile-media-tile').filter((tile) => tile.dataset.featured);
    expect(featured).toHaveLength(1);
    expect(featured[0].className).toContain('col-span-2');
  });

  it('does not feature the first tile', () => {
    renderGrid(items(3));
    expect(screen.getAllByTestId('profile-media-tile')[0].dataset.featured).toBeUndefined();
  });

  it('badges a video, which otherwise looks like a photo until you tap it', () => {
    renderGrid([{ key: 'v', url: 'https://example.com/clip.mp4' }]);
    expect(screen.getByTestId('media-badge-video')).toBeInTheDocument();
  });

  it('badges a tile that came from a note carrying several images', () => {
    renderGrid([{ key: 'm', url: 'https://example.com/a.jpg', multiple: true }]);
    expect(screen.getByTestId('media-badge-multi')).toBeInTheDocument();
  });

  it('leaves a lone still unbadged', () => {
    renderGrid(items(1));
    expect(screen.queryByTestId('media-badge-video')).not.toBeInTheDocument();
    expect(screen.queryByTestId('media-badge-multi')).not.toBeInTheDocument();
  });

  it('lazy-loads, since a prolific profile is hundreds of images', () => {
    renderGrid(items(1));
    expect(screen.getByTestId('profile-media-tile').querySelector('img'))
      .toHaveAttribute('loading', 'lazy');
  });
});
