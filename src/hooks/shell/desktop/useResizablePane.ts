'use client';

import { useEffect, useRef, useState } from 'react';
import { draggedPaneWidth, readPaneWidth } from '@/utils/shell/desktop/pane-width';

/**
 * A resizable pane's width: read from `storageKey` (clamped), followed while
 * the handle is dragged, stored and reported on every change.
 */
export function useResizablePane({ storageKey, defaultWidth, min, max, side, onWidthChange }: {
  storageKey: string;
  defaultWidth: number;
  min: number;
  max: number;
  side: 'right' | 'left';
  onWidthChange?: (w: number) => void;
}) {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined'
      ? defaultWidth
      : readPaneWidth(window.localStorage.getItem(storageKey), defaultWidth, min, max),
  );
  const startRef = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(width));
    onWidthChange?.(width);
  }, [storageKey, width, onWidthChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, w: width };
    const onMove = (ev: MouseEvent) => {
      if (!startRef.current) return;
      setWidth(draggedPaneWidth(startRef.current, ev.clientX, side, min, max));
    };
    // The effect above stores every width the drag passes through.
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      startRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return { width, onMouseDown };
}
