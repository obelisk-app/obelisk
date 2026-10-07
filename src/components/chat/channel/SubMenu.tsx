'use client';

import { useRef, type ReactNode } from 'react';
import { MENU_PANEL_CLASS } from '@/components/ui/overlays/menu';
import { useSubMenuShift } from '@/hooks/chat/channel/useMenuPlacement';

/**
 * A flyout next to its row that never leaves the viewport: it measures itself
 * after rendering and slides up by however much it would overflow the bottom
 * edge. (It used to hang off the bottom of the screen for channels low in the
 * sidebar.)
 */
export function SubMenu({ flip, testId, children }: { flip: boolean; testId: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const shift = useSubMenuShift(ref);
  return (
    <div
      ref={ref}
      role="menu"
      className={`absolute min-w-[230px] ${MENU_PANEL_CLASS} ${flip ? 'right-full mr-1' : 'left-full ml-1'}`}
      style={{ top: shift }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
