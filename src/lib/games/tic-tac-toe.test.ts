import { describe, it, expect } from 'vitest';
import { ticTacToe } from './tic-tac-toe';

const A = 'pk-a';
const B = 'pk-b';

function play(cells: Array<[string, number]>) {
  let state = ticTacToe.initialState([A, B]);
  const participants = [A, B];
  let last;
  for (const [pk, cell] of cells) {
    last = ticTacToe.applyAction(state, { cell }, pk, participants);
    state = last.state;
  }
  return last!;
}

describe('tic-tac-toe', () => {
  it('X wins on a row', () => {
    const r = play([[A, 0], [B, 3], [A, 1], [B, 4], [A, 2]]);
    expect(r.winner).toBe(A);
    expect(r.nextTurn).toBeNull();
  });

  it('draw fills the board', () => {
    const r = play([
      [A, 0], [B, 1], [A, 2],
      [B, 4], [A, 3], [B, 5],
      [A, 7], [B, 6], [A, 8],
    ]);
    // X:0,2,3,7,8  O:1,4,5,6 — no three-in-a-row
    expect(r.draw).toBe(true);
    expect(r.winner).toBeFalsy();
  });

  it('rejects taken cell', () => {
    const state = ticTacToe.initialState([A, B]);
    const s2 = ticTacToe.applyAction(state, { cell: 0 }, A, [A, B]).state;
    const v = ticTacToe.validateAction(s2, { cell: 0 }, B);
    expect(v.ok).toBe(false);
  });

  it('rejects non-participant', () => {
    const state = ticTacToe.initialState([A, B]);
    const v = ticTacToe.validateAction(state, { cell: 0 }, 'pk-c');
    expect(v.ok).toBe(false);
  });

  it('alternates turns', () => {
    let state = ticTacToe.initialState([A, B]);
    const r = ticTacToe.applyAction(state, { cell: 0 }, A, [A, B]);
    expect(r.nextTurn).toBe(B);
  });

  it('timeout awards opponent', () => {
    const state = ticTacToe.initialState([A, B]);
    const r = ticTacToe.onTimeout(state, A, [A, B]);
    expect(r.winner).toBe(B);
    expect(r.eliminated).toEqual([A]);
    expect(r.nextTurn).toBeNull();
  });
});
