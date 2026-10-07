'use client';

import { useRef, useState } from 'react';
import { roleBadgeGlyph, roleEmojiPopoverAnchor, type PopoverAnchor } from '@/utils/admin/role-emoji';

/**
 * The role emoji field's view model. The picker lives in a fixed layer
 * rather than inside the row: the roles panel is overflow-hidden and the
 * list scrolls, so an absolutely positioned popover got clipped away. It is
 * anchored off the button's rect, flipped and clamped to stay on screen.
 */
export function useRoleEmojiField(onPick: (emoji: string) => void) {
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor(roleEmojiPopoverAnchor(rect, { width: window.innerWidth, height: window.innerHeight }));
  };

  const pick = (emoji: string) => {
    const glyph = roleBadgeGlyph(emoji);
    if (glyph) onPick(glyph);
    setAnchor(null);
  };

  return {
    anchor,
    buttonRef,
    toggle: () => (anchor ? setAnchor(null) : open()),
    close: () => setAnchor(null),
    pick,
    clear: () => onPick(''),
  };
}
