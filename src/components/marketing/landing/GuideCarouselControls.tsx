'use client';

import { ChevronLeftIcon, ChevronRightIcon } from '@/assets/icons';
import IconButton from '@/components/ui/buttons/IconButton';
import { useGuideCarouselControls } from '@/hooks/marketing/useGuideCarouselControls';

type Props = {
  /** The id of the scroll-snap track the buttons page through. */
  trackId: string;
  prevLabel: string;
  nextLabel: string;
};

/**
 * Previous / next for the Learn carousel. The track itself is plain CSS
 * scroll-snap (swipe and trackpad work without this); the buttons page it by
 * most of a viewport and grey out at either end.
 */
export default function GuideCarouselControls({ trackId, prevLabel, nextLabel }: Props) {
  const vm = useGuideCarouselControls(trackId);
  return (
    <div className="flex items-center gap-2">
      <IconButton tone="outline" size="10" aria-controls={trackId} aria-label={prevLabel} disabled={vm.atStart} onClick={() => vm.page(-1)}>
        <ChevronLeftIcon size={18} />
      </IconButton>
      <IconButton tone="outline" size="10" aria-controls={trackId} aria-label={nextLabel} disabled={vm.atEnd} onClick={() => vm.page(1)}>
        <ChevronRightIcon size={18} />
      </IconButton>
    </div>
  );
}
