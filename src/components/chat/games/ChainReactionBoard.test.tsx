import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import ChainReactionBoard from './ChainReactionBoard';
import {
  buildCreate,
  buildGameOp,
  parseGameEvent,
  type GameEvent,
  type ParsedGameEvent,
} from '@/lib/games/protocol';
import { chainReaction } from '@/lib/games/chain-reaction';
import { deriveSession, type GameSession } from '@/lib/games/session';

const CH = 'channel-1';
const A = 'pk-ana';
const B = 'pk-bruno';
const GAME_ID = 'a'.repeat(64);
const T0 = 1_760_000_000;

function parsed(id: string, pubkey: string, createdAt: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const p = parseGameEvent({ id, pubkey, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content } as GameEvent);
  if (!p) throw new Error('unparseable');
  return p;
}

/** A started small board (5×7), plus whatever moves are handed in. */
function table(moves: Array<{ n: number; by: string; cell: number }> = []): GameSession {
  const log = [
    parsed(GAME_ID, A, T0, buildCreate(CH, { game: chainReaction.type, opts: { size: 'small' }, turnTimeoutS: 0 })),
    parsed('j1', B, T0 + 1, buildGameOp(CH, GAME_ID, 'join')),
    parsed('s1', A, T0 + 2, buildGameOp(CH, GAME_ID, 'start', { seats: [A, B] })),
    ...moves.map((m, i) =>
      parsed(`m${i}`, m.by, T0 + 3 + i, buildGameOp(CH, GAME_ID, 'move', { n: m.n, seat: m.by, action: { cell: m.cell } })),
    ),
  ];
  const s = deriveSession(log, T0 + 100);
  if (!s) throw new Error('no session');
  return s;
}

function boardWidth(): number {
  const matrix = document.querySelector('.cr-matrix') as HTMLElement;
  return Number.parseInt(matrix.style.width, 10);
}

describe('ChainReactionBoard sizing', () => {
  it('keeps the inline size when it is given only a width', () => {
    render(<ChainReactionBoard game={table()} mySeats={[A]} onAction={vi.fn()} maxWidth={420} />);
    // 5 columns at the inline cell cap of 44px.
    expect(boardWidth()).toBe(220);
  });

  it('grows to fill the room when a height comes with the width', () => {
    // What fullscreen passes on a 1440×900 window.
    render(
      <ChainReactionBoard game={table()} mySeats={[A]} onAction={vi.fn()} maxWidth={1408} maxHeight={690} />,
    );
    // 7 rows into 690px is 98px, over the fullscreen cap, so the cap decides:
    // 5 columns × 92px. The old board was 220px wide here.
    expect(boardWidth()).toBe(460);
  });

  it('fits the shorter dimension rather than overflowing it', () => {
    render(
      <ChainReactionBoard game={table()} mySeats={[A]} onAction={vi.fn()} maxWidth={1408} maxHeight={280} />,
    );
    // 280 / 7 rows = 40px cells, so the board is 200px wide and 280 tall —
    // the height is what it had to fit into.
    expect(boardWidth()).toBe(200);
  });

  it('scales the orbs with the cells, so a big board is not covered in dots', () => {
    const { unmount } = render(
      <ChainReactionBoard game={table([{ n: 0, by: A, cell: 0 }])} mySeats={[A]} onAction={vi.fn()} maxWidth={420} />,
    );
    const inline = (document.querySelector('.cr-matrix') as HTMLElement).style.getPropertyValue('--cr-orb');
    unmount();

    render(
      <ChainReactionBoard game={table([{ n: 0, by: A, cell: 0 }])} mySeats={[A]} onAction={vi.fn()} maxWidth={1408} maxHeight={690} />,
    );
    const full = (document.querySelector('.cr-matrix') as HTMLElement).style.getPropertyValue('--cr-orb');
    expect(Number.parseInt(full, 10)).toBeGreaterThan(Number.parseInt(inline, 10));
  });
});

describe('ChainReactionBoard reveal reporting', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reports while a cascade is playing and again when it settles', () => {
    const onRevealChange = vi.fn();
    // Two orbs stacked in one corner cell: the third goes critical and bursts.
    const before = table([
      { n: 0, by: A, cell: 0 },
      { n: 1, by: B, cell: 34 },
    ]);
    const { rerender } = render(
      <ChainReactionBoard game={before} mySeats={[A]} onAction={vi.fn()} onRevealChange={onRevealChange} />,
    );
    expect(onRevealChange).toHaveBeenLastCalledWith(false);

    // A corner cell has two neighbours, so the second orb dropped on it is
    // the one that bursts.
    const after = table([
      { n: 0, by: A, cell: 0 },
      { n: 1, by: B, cell: 34 },
      { n: 2, by: A, cell: 0 },
    ]);
    act(() => {
      rerender(<ChainReactionBoard game={after} mySeats={[A]} onAction={vi.fn()} onRevealChange={onRevealChange} />);
    });
    expect(onRevealChange).toHaveBeenLastCalledWith(true);

    act(() => { vi.advanceTimersByTime(2000); });
    expect(onRevealChange).toHaveBeenLastCalledWith(false);
  });

  it('renders the board without a reveal listener at all', () => {
    render(<ChainReactionBoard game={table()} mySeats={[A]} onAction={vi.fn()} />);
    expect(screen.getByLabelText('cell 0')).toBeTruthy();
  });
});
