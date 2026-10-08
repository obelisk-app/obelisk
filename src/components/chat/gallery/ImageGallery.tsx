'use client';

import LazyMediaLibraryModal from '@/components/media/library/LazyMediaLibraryModal';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { Lightbox } from './Lightbox';
import { useImageGallery } from '@/hooks/chat/gallery/useImageGallery';
import { GalleryTile } from './GalleryTile';

interface ImageGalleryProps {
  urls: string[];
  wide?: boolean;
}

/**
 * Discord-style image matrix:
 *   1  → single large image (natural aspect)
 *   2  → side-by-side squares
 *   3  → one big left, two stacked right
 *   4  → 2×2 grid
 *   5+ → 2×2 grid of the first 4 images, last tile shows "+N more" overlay
 *       that opens the full lightbox carousel.
 *
 * Tapping any tile opens the lightbox on that index. Lightbox supports
 * prev/next + keyboard arrows + Esc.
 */
export default function ImageGallery({ urls, wide = false }: ImageGalleryProps) {
  const vm = useImageGallery(urls);

  if (urls.length === 0) return null;

  // Single image: keep natural aspect, bounded.
  if (urls.length === 1) {
    return (
      <>
        <div
          className={`mt-1 overflow-hidden rounded-lg bg-lc-black/50 cursor-pointer ${wide ? 'w-full max-w-full' : 'w-fit max-w-sm'}`}
          onClick={() => vm.open(0)}
          data-testid="image-gallery"
          data-count="1"
        >
          <RemoteImage
            src={urls[0]}
            alt=""
            className={`${wide ? 'max-h-[32rem] w-full' : 'max-h-80 w-auto'} object-contain`}
            onError={vm.hideImage}
          />
        </div>
        {vm.lightboxIndex !== null && (
          <Lightbox
            urls={urls}
            index={vm.lightboxIndex}
            onClose={vm.closeLightbox}
            onPrev={vm.prev}
            onNext={vm.next}
          />
        )}
        {vm.selectedMedia && <LazyMediaLibraryModal onClose={vm.closeMedia} initialSelection={vm.selectedMedia} />}
      </>
    );
  }

  // 2+ images: fixed-height matrix so tiles align cleanly; the layout approximates Discord's dynamic grid.
  return (
    <>
      <div
        className={`mt-1 grid ${wide ? 'w-full max-w-full' : 'max-w-sm'} ${vm.layout.gridClass} gap-1 rounded-lg overflow-hidden`}
        style={{ aspectRatio: vm.layout.aspectRatio }}
        data-testid="image-gallery"
        data-count={urls.length}
      >
        {vm.layout.tiles.map((tile) => <GalleryTile key={tile.key} tile={tile} onOpen={vm.open} onError={vm.hideImage} />)}
      </div>
      {vm.lightboxIndex !== null && (
        <Lightbox
          urls={urls}
          index={vm.lightboxIndex}
          onClose={vm.closeLightbox}
          onPrev={vm.prev}
          onNext={vm.next}
        />
      )}
      {vm.selectedMedia && <LazyMediaLibraryModal onClose={vm.closeMedia} initialSelection={vm.selectedMedia} />}
    </>
  );
}
