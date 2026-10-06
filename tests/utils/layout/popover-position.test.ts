import { describe, expect, it } from 'vitest';
import { placePopover } from '@/utils/layout/popover-position';

const viewport = { width: 1200, height: 800 };
const anchor = (top: number, left = 900) => ({ top, bottom: top + 32, left, right: left + 32 });

describe('placePopover', () => {
  it('takes the preferred side when it fits', () => {
    expect(placePopover({ anchor: anchor(100), width: 200, height: 300, viewport, prefer: 'below', align: 'end' }))
      .toEqual({ top: 136, left: 732, side: 'below' });
  });

  it('falls back to the other side', () => {
    expect(placePopover({ anchor: anchor(600), width: 200, height: 300, viewport, prefer: 'below', align: 'end' }).side).toBe('above');
  });

  it('when neither fits it takes the roomier side and clamps into the viewport', () => {
    const p = placePopover({ anchor: anchor(500), width: 200, height: 700, viewport, prefer: 'below', align: 'start' });
    expect(p.side).toBe('above');
    expect(p.top).toBe(8);
  });

  it('start alignment lines up with the left edge and is clamped on the right', () => {
    const p = placePopover({ anchor: anchor(100, 1150), width: 200, height: 100, viewport, prefer: 'below', align: 'start' });
    expect(p.left).toBe(1200 - 8 - 200);
  });
});
