'use client';

import { useRef, useState, type MouseEvent, type WheelEvent } from 'react';

/** Wheel delta per unit of scale: 500 ≈ one mousewheel notch == ~0.2 scale. */
const WHEEL_DIVISOR = 500;
const MAX_SCALE = 5;

/**
 * Zoom and pan of one image. `scale` is clamped to [1, 5]; panning is only
 * enabled when zoomed. Resets whenever `index` changes, in the same render
 * rather than one commit later.
 */
export function useZoomPan(index: number) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // `dragging` is read by the mouse handlers, which need the value as of
  // the last event, not the last render; `isDragging` is the same fact as
  // state so the cursor and the transform transition re-render when a drag
  // starts and stops, not only once the pointer happens to move.
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const didDrag = useRef(false);

  const [shownIndex, setShownIndex] = useState(index);
  if (shownIndex !== index) {
    setShownIndex(index);
    setScale(1);
    setTx(0);
    setTy(0);
  }

  const isZoomed = scale > 1;

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY / WHEEL_DIVISOR;
    setScale((s) => {
      const next = Math.max(1, Math.min(MAX_SCALE, s + delta));
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  };

  const onMouseDown = (e: MouseEvent) => {
    if (!isZoomed) return;
    e.stopPropagation();
    dragging.current = true;
    setIsDragging(true);
    didDrag.current = false;
    lastPoint.current = { x: e.clientX, y: e.clientY };
  };
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging.current || !lastPoint.current) return;
    const dx = e.clientX - lastPoint.current.x;
    const dy = e.clientY - lastPoint.current.y;
    lastPoint.current = { x: e.clientX, y: e.clientY };
    if (Math.abs(dx) + Math.abs(dy) > 2) didDrag.current = true;
    setTx((v) => v + dx);
    setTy((v) => v + dy);
  };
  const onMouseUp = () => {
    dragging.current = false;
    setIsDragging(false);
    lastPoint.current = null;
  };

  const onDoubleClick = (e: MouseEvent) => {
    e.stopPropagation();
    setScale(1);
    setTx(0);
    setTy(0);
  };

  /** True when a backdrop click should be ignored: zoomed, or the click ended a drag. */
  const shouldIgnoreBackdropClick = () => isZoomed || didDrag.current;

  return {
    scale, tx, ty, isZoomed, isDragging,
    onWheel, onMouseDown, onMouseMove, onMouseUp, onDoubleClick, shouldIgnoreBackdropClick,
  };
}
