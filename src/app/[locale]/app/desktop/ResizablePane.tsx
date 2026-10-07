'use client';

import { useTranslations } from 'next-intl';
import { useResizablePane } from '@/hooks/shell/desktop/useResizablePane';

export function ResizablePane({
  storageKey,
  defaultWidth,
  min,
  max,
  side = 'right',
  rounded = true,
  children,
  onWidthChange,
}: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  side?: 'right' | 'left';
  /**
   * The rounded top-left corner belongs to whatever sits leftmost against
   * the rail - the sidebar. A pane on the RIGHT with a rounded top-left
   * looks like a floating card wedged against its neighbour.
   */
  rounded?: boolean;
  children: React.ReactNode;
  onWidthChange?: (w: number) => void;
}) {
  const t = useTranslations();
  const { width, onMouseDown } = useResizablePane({ storageKey, defaultWidth, min, max, side, onWidthChange });

  const handle = (
    <div
      onMouseDown={onMouseDown}
      className="group/handle relative z-20 w-0 cursor-col-resize max-md:hidden"
      title={t('shell.desktop.pane.resize')}
    >
      <div className="absolute inset-y-0 -left-2 right-0 w-4" />
      <div className="pointer-events-none absolute inset-y-0 -left-px w-px bg-lc-green opacity-0 transition-opacity group-hover/handle:opacity-100 group-active/handle:opacity-100" />
    </div>
  );

  return (
    <>
      {side === 'left' && handle}
      <div
        style={{ ['--pane-w' as string]: `${width}px` }}
        className={`lc-pane-surface flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-t border-r border-lc-border w-[var(--pane-w)] max-w-[45vw] max-md:w-[min(72vw,300px)] ${
          rounded ? 'rounded-tl-xl' : ''
        }`}
      >
        {children}
      </div>
      {side === 'right' && handle}
    </>
  );
}
