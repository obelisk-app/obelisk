'use client';

import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { clampMenuPosition, subMenuShift } from '@/components/chat/channel-menu/channel-menu-options';

/** Keep the menu on screen; open submenus to the left near the right edge. */
export function useMenuPlacement(ref: RefObject<HTMLElement | null>, x: number, y: number) {
  const [pos, setPos] = useState({ left: x, top: y });
  const [flipSub, setFlipSub] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const placed = clampMenuPosition(x, y, r.width, r.height, window.innerWidth, window.innerHeight);
    setPos({ left: placed.left, top: placed.top });
    setFlipSub(placed.flipSub);
  }, [ref, x, y]);
  return { pos, flipSub };
}

/** The upward shift a submenu needs to stay inside the viewport, measured after it renders. */
export function useSubMenuShift(ref: RefObject<HTMLElement | null>): number {
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setShift(subMenuShift(r.top, r.bottom, window.innerHeight));
  }, [ref]);
  return shift;
}

/**
 * Close on Escape, on a pointer press outside `ref` (capture phase, so it
 * runs before whatever was pressed), and on any window resize.
 */
export function useMenuDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onClose);
    };
  }, [ref, onClose]);
}
