import { describe, expect, it } from 'vitest';
import { boardPointFromClick } from '@/utils/games/vesta/board-click';

describe('boardPointFromClick', () => {
  it('maps a click on the scaled canvas back to board units', () => {
    const rect = { left: 10, top: 20, width: 400, height: 300 };
    expect(boardPointFromClick(10, 20, rect, { width: 800, height: 600 })).toEqual({ x: 0, y: 0 });
    expect(boardPointFromClick(210, 170, rect, { width: 800, height: 600 })).toEqual({ x: 400, y: 300 });
  });
});
