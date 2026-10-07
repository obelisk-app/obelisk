/**
 * The board canvas is drawn at a fixed internal size and scaled by CSS, so a
 * click has to be mapped back through that ratio before it means anything.
 */
export function boardPointFromClick(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  board: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * board.width,
    y: ((clientY - rect.top) / rect.height) * board.height,
  };
}
