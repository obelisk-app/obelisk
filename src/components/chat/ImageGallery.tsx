'use client';

import { useState } from 'react';
import MediaLibraryModal from '@/components/media/MediaLibraryModal';
import RemoteImage from '@/components/ui/RemoteImage';
import { Lightbox } from './gallery/Lightbox';
import { useGifSelections } from './gallery/useGifSelections';
import { useLightboxIndex } from './gallery/useLightboxIndex';
import type { GifSelection } from './gallery/gif-selections';

export { Lightbox, type LightboxProps } from './gallery/Lightbox';

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
  const [selectedMedia, setSelectedMedia] = useState<GifSelection | null>(null);
  const gifSelections = useGifSelections(urls);
  const { lightboxIndex, setLightboxIndex, close, next, prev } = useLightboxIndex(urls.length);

  const open = (i: number) => {
    const selection = gifSelections.get(urls[i]);
    if (selection) setSelectedMedia(selection);
    else setLightboxIndex(i);
  };

  if (urls.length === 0) return null;

  // Single image: keep natural aspect, bounded.
  if (urls.length === 1) {
    return (
      <>
        <div
          className={`mt-1 overflow-hidden rounded-lg bg-lc-black/50 cursor-pointer ${wide ? 'w-full max-w-full' : 'w-fit max-w-sm'}`}
          onClick={() => open(0)}
          data-testid="image-gallery"
          data-count="1"
        >
          <RemoteImage
            src={urls[0]}
            alt=""
            className={`${wide ? 'max-h-[32rem] w-full' : 'max-h-80 w-auto'} object-contain`}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        {lightboxIndex !== null && (
          <Lightbox
            urls={urls}
            index={lightboxIndex}
            onClose={close}
            onPrev={prev}
            onNext={next}
          />
        )}
        {selectedMedia && <MediaLibraryModal onClose={() => setSelectedMedia(null)} initialSelection={selectedMedia} />}
      </>
    );
  }

  // 2+ images: fixed-height matrix so tiles align cleanly.
  const shown = urls.slice(0, 4);
  const overflow = urls.length - 4;

  // Layout classes per count: approximates Discord's dynamic grid.
  const gridClass =
    urls.length === 2
      ? 'grid-cols-2 grid-rows-1'
      : urls.length === 3
        ? 'grid-cols-2 grid-rows-2'
        : 'grid-cols-2 grid-rows-2';

  return (
    <>
      <div
        className={`mt-1 grid ${wide ? 'w-full max-w-full' : 'max-w-sm'} ${gridClass} gap-1 rounded-lg overflow-hidden`}
        style={{ aspectRatio: urls.length === 2 ? '2 / 1' : '1 / 1' }}
        data-testid="image-gallery"
        data-count={urls.length}
      >
        {shown.map((url, i) => {
          // 3-image layout: first tile spans both rows
          const spanClass =
            urls.length === 3 && i === 0 ? 'row-span-2' : '';
          const isLastOverflow = i === 3 && overflow > 0;
          return (
            <button
              key={`${url}-${i}`}
              type="button"
              onClick={() => open(i)}
              className={`relative overflow-hidden bg-lc-black/50 ${spanClass}`}
              data-testid="gallery-tile"
            >
              <RemoteImage
                src={url}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {isLastOverflow && (
                <div
                  className="absolute inset-0 bg-black/60 flex items-center justify-center text-lc-white text-xl font-bold"
                  data-testid="overflow-overlay"
                >
                  +{overflow}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {lightboxIndex !== null && (
        <Lightbox
          urls={urls}
          index={lightboxIndex}
          onClose={close}
          onPrev={prev}
          onNext={next}
        />
      )}
      {selectedMedia && <MediaLibraryModal onClose={() => setSelectedMedia(null)} initialSelection={selectedMedia} />}
    </>
  );
}
