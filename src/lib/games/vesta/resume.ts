/**
 * The parts of Vesta the table setup needs without the rules: the board
 * seed, and reading a saved game. They touch only Vesta's types, so the new
 * game and seat pickers can import them without fetching the engine, which
 * loads on demand (`../registry.ts`). `definition.ts` re-exports them.
 */
import type { GameState } from 'vesta';

/** Board seeds are chosen by the host; keep them small and human-quotable. */
export function normalizeSeed(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(Math.abs(raw)) % 1_000_000;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.floor(Math.abs(n)) % 1_000_000;
  }
  return 0;
}

/** Accept either a bare GameState or a full `{endState}` record. */
export function readResumeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = 'endState' in (raw as Record<string, unknown>)
    ? (raw as { endState: unknown }).endState
    : 'startState' in (raw as Record<string, unknown>)
      ? (raw as { startState: unknown }).startState
      : raw;
  if (!candidate || typeof candidate !== 'object') return null;
  const s = candidate as Partial<GameState>;
  if (!s.board || !Array.isArray(s.players) || typeof s.currentPlayer !== 'number') return null;
  return s as GameState;
}

/** How many seats a saved game expects. Used to size the table on import. */
export function playerCountOf(resume: unknown): number | null {
  const state = readResumeState(resume);
  return state ? state.players.length : null;
}
