'use client';

import { useState, type DragEvent } from 'react';

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

  /** A category card takes a category (reorder) or a channel (move into it). */
  const dropOnCategory = (index: number, categoryId: string) => {
    if (dragged?.type === 'category') {
      placeCategory(dragged.id, index);
    } else if (dragged?.type === 'channel') {
      placeChannel(dragged.id, categoryId);
    }
    setDragged(null);
  };
  /** The uncategorized bucket takes channels only. Returns whether it took the drop. */
  const dropOnUncategorized = () => {
    if (dragged?.type !== 'channel') return false;
    placeChannel(dragged.id, null);
    setDragged(null);
    return true;
  };
  const grabCategory = (id: string) => setDragged({ type: 'category', id });

  return {
    dragged,
    grabCategory,
    grabChannel: (id: string) => setDragged({ type: 'channel', id }),
    endDrag: () => setDragged(null),
    dropOnCategory,
    dropOnUncategorized,
    /** Drop a channel just before `beforeId`. Returns whether the drop was taken. */
    dropBefore: (categoryId: string | null, beforeId: string) => {
      if (dragged?.type !== 'channel' || dragged.id === beforeId) return false;
      placeChannel(dragged.id, categoryId, beforeId);
      setDragged(null);
      return true;
    },
    // The DOM side, for the editor's markup.
    /** Start dragging a category card by its handle. */
    startCategoryDrag: (event: DragEvent, id: string) => {
      event.dataTransfer.effectAllowed = 'move';
      grabCategory(id);
    },
    /** A card is a drop target only while something is grabbed. */
    cardDragOver: (event: DragEvent) => {
      if (dragged) event.preventDefault();
    },
    cardDrop: (event: DragEvent, index: number, categoryId: string) => {
      event.preventDefault();
      dropOnCategory(index, categoryId);
    },
    /** The uncategorized bucket is a drop target only for a channel. */
    bucketDragOver: (event: DragEvent) => {
      if (dragged?.type === 'channel') event.preventDefault();
    },
    bucketDrop: (event: DragEvent) => {
      if (dropOnUncategorized()) event.preventDefault();
    },
  };
}

export type LayoutDrag = ReturnType<typeof useLayoutDrag>;
