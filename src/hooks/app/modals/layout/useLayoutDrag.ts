'use client';

import { useState } from 'react';

type Dragged = { type: 'category' | 'channel'; id: string } | null;

/**
 * Drag-and-drop state for the layout editor: what is being dragged, and what
 * a drop on a category, on the uncategorized bucket, or before a channel row
 * does with it. The placing itself is the editor hook's.
 */
export function useLayoutDrag({ placeCategory, placeChannel }: {
  placeCategory: (categoryId: string, index: number) => void;
  placeChannel: (channelId: string, categoryId: string | null, beforeId?: string) => void;
}) {
  const [dragged, setDragged] = useState<Dragged>(null);
  return {
    dragged,
    grabCategory: (id: string) => setDragged({ type: 'category', id }),
    grabChannel: (id: string) => setDragged({ type: 'channel', id }),
    endDrag: () => setDragged(null),
    /** A category card takes a category (reorder) or a channel (move into it). */
    dropOnCategory: (index: number, categoryId: string) => {
      if (dragged?.type === 'category') {
        placeCategory(dragged.id, index);
      } else if (dragged?.type === 'channel') {
        placeChannel(dragged.id, categoryId);
      }
      setDragged(null);
    },
    /** The uncategorized bucket takes channels only. Returns whether it took the drop. */
    dropOnUncategorized: () => {
      if (dragged?.type !== 'channel') return false;
      placeChannel(dragged.id, null);
      setDragged(null);
      return true;
    },
    /** Drop a channel just before `beforeId`. Returns whether the drop was taken. */
    dropBefore: (categoryId: string | null, beforeId: string) => {
      if (dragged?.type !== 'channel' || dragged.id === beforeId) return false;
      placeChannel(dragged.id, categoryId, beforeId);
      setDragged(null);
      return true;
    },
  };
}
