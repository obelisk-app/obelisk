'use client';

import type { MouseEvent } from 'react';
import { useZoomPan } from './useZoomPan';

/**
 * The lightbox's view model: zoom and pan of the shown image, and the
 * clicks. A backdrop click closes only when the image is neither zoomed nor
 * being dragged, so a pan cannot close it by accident; the buttons keep
 * their click from reaching the backdrop.
 */
export function useLightbox(index: number, onClose: () => void, onPrev: () => void, onNext: () => void) {
  const zoom = useZoomPan(index);
  const only = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return {
    ...zoom,
    cursor: zoom.isZoomed ? (zoom.isDragging ? 'grabbing' : 'grab') : 'zoom-in',
    transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`,
    backdropClick: () => {
      if (zoom.shouldIgnoreBackdropClick()) return;
      onClose();
    },
    closeClick: only(onClose),
    prevClick: only(onPrev),
    nextClick: only(onNext),
  };
}
