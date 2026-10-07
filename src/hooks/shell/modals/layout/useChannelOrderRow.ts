'use client';

import type { ChangeEvent, DragEvent } from 'react';

/**
 * The DOM side of one channel row in the layout editor: dragging it by its
 * handle, dropping another channel before it, and its category picker
 * (the empty option is "uncategorized").
 */
export function useChannelOrderRow({ onGrab, onDropBefore, onChangeCategory }: {
  onGrab: () => void;
  /** Whether the row took the drop; one it refuses goes on to the card around it. */
  onDropBefore: () => boolean;
  onChangeCategory: (categoryId: string | null) => void;
}) {
  return {
    onDragOver: (event: DragEvent) => event.preventDefault(),
    onDrop: (event: DragEvent) => {
      if (!onDropBefore()) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = 'move';
      onGrab();
    },
    onCategoryChange: (event: ChangeEvent<HTMLSelectElement>) => onChangeCategory(event.target.value || null),
  };
}
