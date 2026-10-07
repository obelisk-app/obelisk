'use client';

import { useState } from 'react';
import type { GifSelection } from '@/utils/media/library/gif-selections';
import { galleryLayout } from '@/utils/chat/gallery/gallery-layout';
import { hideBrokenImage } from '@/utils/media/remote/hide-broken-image';
import { useGifSelections } from './useGifSelections';
import { useLightboxIndex } from './useLightboxIndex';

/**
 * A chat image matrix's view model: its layout, the lightbox it opens, and
 * the media library a known GIF or sticker opens instead (so it can be
 * saved or reused).
 */
export function useImageGallery(urls: string[]) {
  const [selectedMedia, setSelectedMedia] = useState<GifSelection | null>(null);
  const gifSelections = useGifSelections(urls);
  const lightbox = useLightboxIndex(urls.length);
  return {
    layout: galleryLayout(urls),
    lightboxIndex: lightbox.lightboxIndex,
    closeLightbox: lightbox.close,
    next: lightbox.next,
    prev: lightbox.prev,
    selectedMedia,
    closeMedia: () => setSelectedMedia(null),
    open: (i: number) => {
      const selection = gifSelections.get(urls[i]);
      if (selection) setSelectedMedia(selection);
      else lightbox.setLightboxIndex(i);
    },
    /** A broken image hides itself rather than showing the browser's broken-image box. */
    hideImage: hideBrokenImage,
  };
}
