'use client';

import { useTranslations } from 'next-intl';
import IconButton from '@/components/ui/buttons/IconButton';
import { useScrollableRail } from '@/hooks/voice/room/useScrollableRail';
import { ChevronLeftIcon, ChevronRightIcon } from '@/assets/icons';

/** The side rail (a bottom strip on a phone), with arrows while there is more to scroll. */
export default function ScrollableRail({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { railRef, ...vm } = useScrollableRail(children);

  return (
    <div className="relative md:w-56 lg:w-64 shrink-0 min-h-0">
      <aside
        ref={railRef as React.RefObject<HTMLElement>}
        onScroll={vm.update}
        className="h-full flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto pb-1 md:pb-0 scroll-smooth"
      >
        {children}
      </aside>
      {vm.canPrev && (
        <IconButton
          tone="overlay"
          size="7"
          onClick={() => vm.scroll(-1)}
          aria-label={t('common.previous')}
          className="absolute z-10 left-1 md:left-1/2 md:-translate-x-1/2 top-1 md:top-1 shadow-lg ring-1 ring-white/15"
        >
          <ChevronLeftIcon size={14} strokeWidth={2.5} className="md:rotate-90" />
        </IconButton>
      )}
      {vm.canNext && (
        <IconButton
          tone="overlay"
          size="7"
          onClick={() => vm.scroll(1)}
          aria-label={t('common.next')}
          className="absolute z-10 right-1 md:right-auto md:left-1/2 md:-translate-x-1/2 bottom-auto top-1/2 -translate-y-1/2 md:translate-y-0 md:top-auto md:bottom-1 shadow-lg ring-1 ring-white/15"
        >
          <ChevronRightIcon size={14} strokeWidth={2.5} className="md:rotate-90" />
        </IconButton>
      )}
    </div>
  );
}
