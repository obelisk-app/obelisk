import { describe, expect, it, vi } from 'vitest';
import { createState } from '@/lib/games/stacker/engine';
import { drawWell } from '@/components/chat/games/stacker/draw-well';

function recordingContext() {
  const gradient = { addColorStop: vi.fn() };
  const fills: unknown[] = [];
  const ctx = {
    clearRect: vi.fn(),
    fillRect: vi.fn((..._args: number[]) => { fills.push(ctx.fillStyle); }),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
  };
  return { ctx, fills };
}

describe('drawWell', () => {
  it('paints a fresh game without a veil', () => {
    const { ctx, fills } = recordingContext();
    drawWell(ctx as unknown as CanvasRenderingContext2D, createState(7), 10, false);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(fills).not.toContain('rgba(0,0,0,0.62)');
  });

  it('veils the well when dimmed', () => {
    const { ctx, fills } = recordingContext();
    drawWell(ctx as unknown as CanvasRenderingContext2D, createState(7), 10, true);
    expect(fills).toContain('rgba(0,0,0,0.62)');
  });
});
