import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MiniBoard from '@/components/games/stacker/MiniBoard';
import PieceChip from '@/components/games/stacker/PieceChip';
import StackerBoard from '@/components/games/stacker/StackerBoard';
import { createState, encodeBoard, HEIGHT, WIDTH } from '@/lib/games/stacker/engine';
import type { StackerRunner } from '@/lib/games/stacker/runner';
import { LocaleProvider } from '@tests/support/intl';

/**
 * What the three Stacker canvases paint: the opponent's mini well, a piece
 * chip, and the playfield's subscription to the runner. Written against the
 * components before they moved onto the markup-only rule.
 */

interface Call { op: string; args: unknown[]; fill: unknown; alpha: number }

/** A 2D context that records every call with the fill and alpha in force. */
function recordingContext() {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1 };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ op: key, args, fill: target.fillStyle, alpha: target.globalAlpha as number });
        if (key === 'createLinearGradient') {
          return { addColorStop: (...stop: unknown[]) => calls.push({ op: 'addColorStop', args: stop, fill: null, alpha: 1 }) };
        }
        return undefined;
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx, calls, ops: (op: string) => calls.filter((c) => c.op === op) };
}

let rec: ReturnType<typeof recordingContext>;

beforeEach(() => {
  rec = recordingContext();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => rec.ctx) as never;
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('MiniBoard', () => {
  it('falls back to a stack-height bar when no snapshot has arrived', () => {
    const { getByTestId } = render(<MiniBoard board={null} height={5} dead={false} cell={6} />);
    const canvas = getByTestId('stacker-miniboard') as HTMLCanvasElement;
    expect(canvas.width).toBe(WIDTH * 6);
    expect(canvas.height).toBe(HEIGHT * 6);
    expect(canvas.style.width).toBe(`${WIDTH * 6}px`);
    expect(rec.ops('clearRect')).toHaveLength(1);
    expect(rec.ops('fillRect')).toEqual([
      { op: 'fillRect', args: [0, 0, 60, 120], fill: '#08080a', alpha: 1 },
      { op: 'fillRect', args: [0, 120 - 30, 60, 30], fill: '#b4f953', alpha: 0.5 },
    ]);
    expect(rec.ctx.globalAlpha).toBe(1);
  });

  it('caps the bar at the well height and greys and veils a dead player', () => {
    render(<MiniBoard board={null} height={99} dead cell={4} />);
    expect(rec.ops('fillRect')).toEqual([
      { op: 'fillRect', args: [0, 0, 40, 80], fill: '#08080a', alpha: 1 },
      { op: 'fillRect', args: [0, 0, 40, 80], fill: '#3f3f46', alpha: 0.5 },
      { op: 'fillRect', args: [0, 0, 40, 80], fill: 'rgba(0,0,0,0.55)', alpha: 1 },
    ]);
  });

  it('draws one square per filled cell of the snapshot, in its piece colour', () => {
    const state = createState(3);
    const bottom = state.board[state.board.length - 1];
    bottom[0] = 1;
    bottom[1] = 6;
    render(<MiniBoard board={encodeBoard(state)} height={1} dead={false} />);
    const cells = rec.ops('fillRect').slice(1);
    expect(cells).toEqual([
      { op: 'fillRect', args: [0, (HEIGHT - 1) * 6, 5.5, 5.5], fill: '#22d3ee', alpha: 1 },
      { op: 'fillRect', args: [6, (HEIGHT - 1) * 6, 5.5, 5.5], fill: '#a855f7', alpha: 1 },
    ]);
  });

  it('draws a dead player\'s cells grey', () => {
    const state = createState(3);
    state.board[state.board.length - 1][0] = 1;
    render(<MiniBoard board={encodeBoard(state)} height={1} dead />);
    expect(rec.ops('fillRect').map((c) => c.fill)).toEqual(['#08080a', '#3f3f46', 'rgba(0,0,0,0.55)']);
  });
});

describe('PieceChip', () => {
  it('sizes the canvas and labels the chip', () => {
    const { getByTestId } = render(<PieceChip kind={null} label="Hold" size={10} />);
    const canvas = getByTestId('chip-hold') as HTMLCanvasElement;
    expect(canvas.width).toBe(40);
    expect(canvas.height).toBe(20);
    expect(rec.ops('clearRect')).toEqual([{ op: 'clearRect', args: [0, 0, 40, 20], fill: '', alpha: 1 }]);
    expect(rec.ops('fill')).toHaveLength(0);
  });

  it('paints the four cells of a piece, centred, dimmed when asked', () => {
    const { getByTestId } = render(<PieceChip kind="T" dim size={10} />);
    expect(getByTestId('chip')).toBeInTheDocument();
    const fills = rec.ops('fill');
    expect(fills).toHaveLength(4);
    expect(fills.every((c) => c.alpha === 0.45)).toBe(true);
    expect(rec.ops('addColorStop').filter((c) => c.args[1] === '#a855f7')).toHaveLength(4);
    expect(rec.ctx.globalAlpha).toBe(1);
  });

  it('centres an I piece across the whole chip', () => {
    render(<PieceChip kind="I" size={10} />);
    // Every cell starts with a moveTo at its own left edge (rounded or not).
    const xs = rec.ops('moveTo').map((c) => c.args[0] as number);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.5);
    expect(Math.max(...xs)).toBeLessThanOrEqual(40);
    expect(rec.ops('fill')).toHaveLength(4);
    expect(rec.ops('fill').every((c) => c.alpha === 1)).toBe(true);
    expect(rec.ops('addColorStop').filter((c) => c.args[1] === '#22d3ee')).toHaveLength(4);
  });
});

describe('StackerBoard', () => {
  function fakeRunner() {
    let frame: ((state: unknown) => void) | null = null;
    const off = vi.fn();
    const runner = {
      onFrame: vi.fn((fn: (state: unknown) => void) => { frame = fn; return off; }),
    } as unknown as StackerRunner;
    return { runner, off, draw: (state: unknown) => frame?.(state) };
  }

  const renderBoard = (runner: StackerRunner, cell: number, dimmed?: boolean) => (
    <LocaleProvider initialLocale="en"><StackerBoard runner={runner} cell={cell} dimmed={dimmed} /></LocaleProvider>
  );

  it('sizes the canvas, subscribes to frames and paints the well on each', () => {
    const { runner, off, draw } = fakeRunner();
    const { getByTestId, unmount } = render(renderBoard(runner, 10));
    const canvas = getByTestId('stacker-board') as HTMLCanvasElement;
    expect(canvas.width).toBe(WIDTH * 10);
    expect(canvas.height).toBe(HEIGHT * 10);
    expect(canvas).toHaveAttribute('aria-label');
    expect(runner.onFrame).toHaveBeenCalledTimes(1);
    draw(createState(1));
    expect(rec.ops('clearRect')).toHaveLength(1);
    unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('follows the dimmed flag without subscribing again', () => {
    const { runner, draw } = fakeRunner();
    const { rerender } = render(renderBoard(runner, 10, false));
    draw(createState(1));
    expect(rec.ops('fillRect').some((c) => c.fill === 'rgba(0,0,0,0.62)')).toBe(false);
    rerender(renderBoard(runner, 10, true));
    expect(runner.onFrame).toHaveBeenCalledTimes(1);
    draw(createState(1));
    expect(rec.ops('fillRect').some((c) => c.fill === 'rgba(0,0,0,0.62)')).toBe(true);
  });

  it('subscribes again when the cell size changes', () => {
    const { runner, off } = fakeRunner();
    const { rerender } = render(renderBoard(runner, 10));
    rerender(renderBoard(runner, 12));
    expect(off).toHaveBeenCalledTimes(1);
    expect(runner.onFrame).toHaveBeenCalledTimes(2);
  });
});
