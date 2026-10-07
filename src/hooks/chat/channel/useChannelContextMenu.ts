'use client';

import { useRef, useState } from 'react';
import type { ChannelActionsTarget } from './useChannelActions';
import { useChannelMenuActions } from './useChannelMenuActions';
import { useMenuDismiss, useMenuPlacement } from './useMenuPlacement';

export type ChannelSubMenu = 'mute' | 'notify';

/**
 * The desktop channel menu's view model: where it sits (kept on screen), the
 * open submenu, dismissal on Escape or a click outside, and the menu's
 * closing actions.
 */
export function useChannelContextMenu(target: ChannelActionsTarget, x: number, y: number, onClose: () => void) {
  const actions = useChannelMenuActions(target, onClose);
  const ref = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<ChannelSubMenu | null>(null);
  const { pos, flipSub } = useMenuPlacement(ref, x, y);
  useMenuDismiss(ref, onClose);
  return {
    ...actions,
    ref,
    pos,
    flipSub,
    sub,
    openSub: (which: ChannelSubMenu) => setSub(which),
    closeSub: () => setSub(null),
    /** A click on a submenu's row opens it, or closes it when it is the open one. */
    toggleSub: (which: ChannelSubMenu) => setSub((open) => (open === which ? null : which)),
  };
}
