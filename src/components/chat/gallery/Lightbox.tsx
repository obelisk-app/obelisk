'use client';

import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n/context';
import RemoteImage from '@/components/ui/RemoteImage';
import { useZoomPan } from '@/hooks/chat/gallery/useZoomPan';
import IconButton from '@/components/ui/IconButton';

/** Exported so other media surfaces (the feed's carousel) zoom identically. */
export interface LightboxProps {
  urls: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function Lightbox({ urls, index, onClose, onPrev, onNext }: LightboxProps) {
  const { t } = useTranslation();
  const {
    scale, tx, ty, isZoomed, isDragging,
    onWheel, onMouseDown, onMouseMove, onMouseUp, onDoubleClick, shouldIgnoreBackdropClick,
  } = useZoomPan(index);

  // Backdrop click closes only when we're neither zoomed nor dragging;
  // prevents accidental closes mid-pan.
  const handleBackdropClick = () => {
    if (shouldIgnoreBackdropClick()) return;
    onClose();
  };

  /*
   * Portalled to `document.body`, and it has to be.
   *
   * `position: fixed` is positioned against the viewport only while no
   * ancestor establishes a containing block: and a feed note does:
   * `.note-card` carries `contain: layout paint` (that containment is what
   * keeps one overflowing note from re-measuring the whole column on every
   * scroll tick). Inside one, the lightbox was laid out against the card
   * and clipped by it, so clicking an image in the feed appeared to do
   * nothing. In chat there is no such ancestor, which is why the same code
   * worked there.
   */
  const panel = (
    <div
      className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center"
      onClick={handleBackdropClick}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onMouseMove={onMouseMove}
      data-testid="lightbox"
    >
      <IconButton
        tone="overlay"
        size="10"
        aria-label={t('common.close')}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </IconButton>

      {urls.length > 1 && (
        <>
          <IconButton
            tone="overlay"
            size="10"
            aria-label={t('common.previous')}
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className={`absolute left-4 top-1/2 -translate-y-1/2 ${isZoomed ? 'pointer-events-none opacity-50' : ''}`}
            data-testid="lightbox-prev"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </IconButton>
          <IconButton
            tone="overlay"
            size="10"
            aria-label={t('common.next')}
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className={`absolute right-4 top-1/2 -translate-y-1/2 ${isZoomed ? 'pointer-events-none opacity-50' : ''}`}
            data-testid="lightbox-next"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </IconButton>
        </>
      )}

      <div
        className="max-w-[90vw] max-h-[90vh]"
        onWheel={onWheel}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={onDoubleClick}
        onMouseDown={onMouseDown}
        style={{
          cursor: isZoomed ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
        data-testid="lightbox-viewport"
      >
        <RemoteImage
          src={urls[index]}
          alt=""
          draggable={false}
          className="max-w-[90vw] max-h-[90vh] object-contain select-none"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        />
      </div>

      {urls.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-lc-white bg-lc-black/70 px-3 py-1 rounded-full">
          {index + 1} / {urls.length}
        </div>
      )}
    </div>
  );

  // During SSR there is no body to portal into; the lightbox only ever
  // opens from a click, so rendering nothing then costs nothing.
  return typeof document === 'undefined' ? panel : createPortal(panel, document.body);
}
