import { describe, expect, it, vi } from 'vitest';
import { canvasDpr, drawConnected, mix, parseHex } from '@/components/games/stacker/block-paint';

function recordingContext() {
  const gradient = { addColorStop: vi.fn() };
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
  };
}

describe('colour helpers', () => {
  it('parses six- and three-digit hex', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('#f80')).toEqual([255, 136, 0]);
  });

  it('mixes toward another colour by the given amount', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('rgb(0,0,0)');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(mix('#ff0000', '#000000', 1)).toBe('rgb(0,0,0)');
  });
});

describe('canvasDpr', () => {
  it('caps the device pixel ratio at 2', () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    expect(canvasDpr()).toBe(2);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original });
  });
});

describe('drawConnected', () => {
  it('rounds all four corners of a lone cell and bevels every side', () => {
    const ctx = recordingContext();
    drawConnected(ctx as unknown as CanvasRenderingContext2D, 0, 0, 20, '#22d3ee', { up: false, down: false, left: false, right: false }, false);
    expect(ctx.quadraticCurveTo).toHaveBeenCalledTimes(4);
    expect(ctx.stroke).toHaveBeenCalledTimes(4);
  });

  it('squares off the corners and drops the bevels where it joins its own kind', () => {
    const ctx = recordingContext();
    drawConnected(ctx as unknown as CanvasRenderingContext2D, 0, 0, 20, '#22d3ee', { up: true, down: true, left: true, right: true }, false);
    expect(ctx.quadraticCurveTo).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});
