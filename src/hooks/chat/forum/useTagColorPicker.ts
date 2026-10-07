'use client';

import { useRef, useState } from 'react';
import type { JsForumTag } from '@/services/nostr-bridge';
import { paletteForTag } from '@/utils/chat/forum/forum-tag-colors';
import { useDismiss } from '@/hooks/common/useDismiss';

/** A tag's colour swatch and popover: open or closed (Escape or a press outside closes it), and a pick that closes it. */
export function useTagColorPicker(tag: JsForumTag, onPick: (color: string | null) => void) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss({ refs: [ref], onDismiss: () => setOpen(false), enabled: open });
  return {
    open,
    ref,
    current: paletteForTag(tag),
    toggle: () => setOpen((v) => !v),
    /** A palette key, or null for "Auto" (derive the colour from the tag id again). */
    pick: (color: string | null) => {
      onPick(color);
      setOpen(false);
    },
  };
}
