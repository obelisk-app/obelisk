import { describe, expect, it } from 'vitest';
import { panelPositionStyle } from '@/utils/shell/user-panel/panel-position';

const viewport = { width: 1000, height: 800 };

describe('panelPositionStyle', () => {
  it('sits bottom-left by default', () => {
    expect(panelPositionStyle(undefined, viewport)).toEqual({ position: 'fixed', left: 8, bottom: 72 });
  });

  it('opens below an anchor, or above it when asked', () => {
    expect(panelPositionStyle({ x: 100, y: 50 }, viewport)).toEqual({ position: 'fixed', left: 100, top: 58 });
    expect(panelPositionStyle({ x: 100, y: 700, placement: 'top' }, viewport)).toEqual({ position: 'fixed', left: 100, bottom: 108 });
  });

  it('keeps the 340px panel inside the window', () => {
    expect(panelPositionStyle({ x: 990, y: 0 }, viewport).left).toBe(652);
    expect(panelPositionStyle({ x: -50, y: 0 }, viewport).left).toBe(8);
  });
});
