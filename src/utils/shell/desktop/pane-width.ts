/** `width` held inside `[min, max]`. */
export function clampPaneWidth(width: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, width));
}

/** A stored pane width, clamped to the range; the default when nothing usable is stored. */
export function readPaneWidth(stored: string | null, defaultWidth: number, min: number, max: number): number {
  const n = stored ? parseInt(stored, 10) : defaultWidth;
  return Number.isFinite(n) ? clampPaneWidth(n, min, max) : defaultWidth;
}

/**
 * The width while dragging the handle: a pane whose handle is on its right
 * grows as the pointer moves right, one whose handle is on its left grows as
 * it moves left.
 */
export function draggedPaneWidth(
  start: { x: number; w: number },
  clientX: number,
  side: 'right' | 'left',
  min: number,
  max: number,
): number {
  const delta = clientX - start.x;
  return clampPaneWidth(side === 'right' ? start.w + delta : start.w - delta, min, max);
}
