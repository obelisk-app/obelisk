import { render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMiniBoard } from '@/hooks/games/stacker/useMiniBoard';
import { usePieceChip } from '@/hooks/games/stacker/usePieceChip';
import { useStackerBoard } from '@/hooks/games/stacker/useStackerBoard';
import { HEIGHT, WIDTH } from '@/lib/games/stacker/engine';
import type { StackerRunner } from '@/lib/games/stacker/runner';

/** The three canvas hooks: the size they report and the canvas they paint. */

function fakeContext() {
  return new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (key in target ? target[key] : vi.fn(() => ({ addColorStop: vi.fn() }))),
    set: (target, key: string, value) => { target[key] = value; return true; },
  });
}

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
});

describe('useMiniBoard', () => {
  it('reports the well size and paints into the canvas it is given', () => {
    const { result } = renderHook(() => useMiniBoard({ board: null, height: 2, dead: false, cell: 5 }));
    expect(result.current.style).toEqual({ width: WIDTH * 5, height: HEIGHT * 5 });

    const ctx = fakeContext();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never;
    function Harness() {
      const { canvasRef } = useMiniBoard({ board: null, height: 2, dead: false, cell: 5 });
      return <canvas ref={canvasRef} data-testid="c" />;
    }
    const { getByTestId } = render(<Harness />);
    expect((getByTestId('c') as HTMLCanvasElement).width).toBe(WIDTH * 5);
    expect(ctx.globalAlpha).toBe(1);
  });
});

describe('usePieceChip', () => {
  it('reports a four by two chip', () => {
    const { result } = renderHook(() => usePieceChip({ kind: 'T', size: 12 }));
    expect(result.current.style).toEqual({ width: 48, height: 24 });
  });
});

describe('useStackerBoard', () => {
  it('subscribes the canvas to the runner and lets go on unmount', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeContext()) as never;
    const off = vi.fn();
    const runner = { onFrame: vi.fn(() => off) } as unknown as StackerRunner;
    function Harness() {
      const { canvasRef, style } = useStackerBoard({ runner, cell: 10 });
      return <canvas ref={canvasRef} style={style} data-testid="c" />;
    }
    const { getByTestId, unmount } = render(<Harness />);
    expect(getByTestId('c').style.width).toBe(`${WIDTH * 10}px`);
    expect(runner.onFrame).toHaveBeenCalledTimes(1);
    unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe without a canvas', () => {
    const runner = { onFrame: vi.fn() } as unknown as StackerRunner;
    renderHook(() => useStackerBoard({ runner, cell: 10 }));
    expect(runner.onFrame).not.toHaveBeenCalled();
  });
});
