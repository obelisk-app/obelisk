'use client';

import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useLightbox } from '@/hooks/chat/gallery/useLightbox';
import IconButton from '@/components/ui/buttons/IconButton';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@/assets/icons';

/** Exported so other media surfaces (the feed's carousel) zoom identically. */
export interface LightboxProps {
  urls: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function Lightbox({ urls, index, onClose, onPrev, onNext }: LightboxProps) {
  const t = useTranslations();
  const vm = useLightbox(index, onClose, onPrev, onNext);

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
      onClick={vm.backdropClick}
      onMouseUp={vm.onMouseUp}
      onMouseLeave={vm.onMouseUp}
      onMouseMove={vm.onMouseMove}
      data-testid="lightbox"
    >
      <IconButton
        tone="overlay"
        size="10"
        aria-label={t('common.close')}
        onClick={vm.closeClick}
        className="absolute top-4 right-4 z-10"
      >
        <CloseIcon size={20} strokeWidth={2.5} />
      </IconButton>

      {urls.length > 1 && (
        <>
          <IconButton
            tone="overlay"
            size="10"
            aria-label={t('common.previous')}
            onClick={vm.prevClick}
            className={`absolute left-4 top-1/2 -translate-y-1/2 ${vm.isZoomed ? 'pointer-events-none opacity-50' : ''}`}
            data-testid="lightbox-prev"
          >
            <ChevronLeftIcon size={24} strokeWidth={2.5} />
          </IconButton>
          <IconButton
            tone="overlay"
            size="10"
            aria-label={t('common.next')}
            onClick={vm.nextClick}
            className={`absolute right-4 top-1/2 -translate-y-1/2 ${vm.isZoomed ? 'pointer-events-none opacity-50' : ''}`}
            data-testid="lightbox-next"
          >
            <ChevronRightIcon size={24} strokeWidth={2.5} />
          </IconButton>
        </>
      )}

      <div
        className="max-w-[90vw] max-h-[90vh]"
        onWheel={vm.onWheel}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={vm.onDoubleClick}
        onMouseDown={vm.onMouseDown}
        style={{ cursor: vm.cursor }}
        data-testid="lightbox-viewport"
      >
        <RemoteImage
          src={urls[index]}
          alt=""
          draggable={false}
          className="max-w-[90vw] max-h-[90vh] object-contain select-none"
          style={{
            transform: vm.transform,
            transformOrigin: 'center center',
            transition: vm.isDragging ? 'none' : 'transform 0.1s ease-out',
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
