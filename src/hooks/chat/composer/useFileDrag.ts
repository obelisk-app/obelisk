'use client';

import { useRef, useState, type DragEvent } from 'react';

const hasFiles = (event: DragEvent<HTMLElement>) =>
  Array.from(event.dataTransfer.types).includes('Files');

/**
 * Drag-and-drop of files onto an element: whether files are over it, and
 * the four handlers. Counts enter/leave depth so moving across children
 * does not flicker the overlay; drags that carry no files are ignored.
 */
export function useFileDrag(onFiles: (files: File[]) => void, disabled?: boolean) {
  const [active, setActive] = useState(false);
  const dragDepth = useRef(0);
  const handlers = {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      if (!disabled) setActive(true);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setActive(false);
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (!disabled && files.length) onFiles(files);
    },
  };
  return { active, handlers };
}
