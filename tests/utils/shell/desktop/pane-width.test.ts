import { describe, expect, it } from 'vitest';
import { clampPaneWidth, draggedPaneWidth, readPaneWidth } from '@/utils/shell/desktop/pane-width';

describe('pane width helpers', () => {
  it('clamps into the range', () => {
    expect(clampPaneWidth(10, 200, 400)).toBe(200);
    expect(clampPaneWidth(300, 200, 400)).toBe(300);
    expect(clampPaneWidth(900, 200, 400)).toBe(400);
  });

  it('reads a stored width, clamped, or falls back to the default', () => {
    expect(readPaneWidth('320', 260, 200, 400)).toBe(320);
    expect(readPaneWidth('9000', 260, 200, 400)).toBe(400);
    expect(readPaneWidth(null, 260, 200, 400)).toBe(260);
    expect(readPaneWidth('wide', 260, 200, 400)).toBe(260);
    // The default itself is clamped like a stored value.
    expect(readPaneWidth(null, 100, 200, 400)).toBe(200);
  });

  it('follows the pointer: right-hand handles grow rightwards, left-hand ones leftwards', () => {
    const start = { x: 100, w: 260 };
    expect(draggedPaneWidth(start, 150, 'right', 200, 400)).toBe(310);
    expect(draggedPaneWidth(start, 150, 'left', 200, 400)).toBe(210);
    expect(draggedPaneWidth(start, 1000, 'right', 200, 400)).toBe(400);
  });
});
