import { StackerRunner, type StackerRunnerOptions, type StackerSoundEvent } from './runner';

/**
 * Keeps a Stacker run alive while nobody is looking at it.
 *
 * The board is a live simulation held on a `StackerRunner` instance, not
 * something replayed from the relay log — checkpoints are published for the
 * *other* players to watch, and are far too coarse to rebuild your own well
 * from. So the runner's identity is the game: lose it and the match restarts.
 *
 * `GameModalHost` unmounts the whole modal when the table is closed, which used
 * to take the runner with it. Reopening built a fresh one from the seed, so the
 * player came back to an empty well on frame 0 — and every piece of garbage
 * that had ever been sent landed again, because the dedupe set died too.
 *
 * Runs therefore live here, keyed per player per match, and the hook borrows
 * one instead of constructing it. A run is dropped when its match ends; the cap
 * catches tables that are simply walked away from.
 */

/** Callbacks are re-pointed by whichever hook instance is currently mounted. */
export interface StackerRunCallbacks {
  onAttack: StackerRunnerOptions['onAttack'];
  onCheckpoint: StackerRunnerOptions['onCheckpoint'];
  onTopOut: StackerRunnerOptions['onTopOut'];
  onEvent: (event: StackerSoundEvent) => void;
}

export interface StackerRun {
  key: string;
  seed: number;
  runner: StackerRunner;
  cb: StackerRunCallbacks;
}

/**
 * How many suspended runs to keep. A player can only look at one table at a
 * time, so this is really a bound on abandoned ones; each is a board and an
 * input log, not a timer — a stopped runner costs nothing but memory.
 */
export const MAX_SUSPENDED_RUNS = 4;

const runs = new Map<string, StackerRun>();

function noop(): void {}

/**
 * The run for `key`, resumed if it exists and created if it does not.
 *
 * A changed `seed` under the same key means a different match (a rematch on the
 * same table), so the old run is discarded rather than resumed.
 */
export function acquireRun(key: string, seed: number): StackerRun {
  const existing = runs.get(key);
  if (existing && existing.seed === seed) {
    // Refresh insertion order so the run in use is the last to be evicted.
    runs.delete(key);
    runs.set(key, existing);
    return existing;
  }
  if (existing) {
    existing.runner.stop();
    runs.delete(key);
  }

  const cb: StackerRunCallbacks = {
    onAttack: noop,
    onCheckpoint: noop,
    onTopOut: noop,
    onEvent: noop,
  };
  const run: StackerRun = {
    key,
    seed,
    cb,
    runner: new StackerRunner({
      seed,
      // Indirection through `cb` is the point: the runner outlives the
      // component that made it, so it must never close over that component's
      // props. Binding them directly left a resumed run publishing attacks
      // through the unmounted table's callbacks.
      onAttack: (lines, hole, nonce) => cb.onAttack(lines, hole, nonce),
      onCheckpoint: (payload) => cb.onCheckpoint(payload),
      onTopOut: () => cb.onTopOut(),
      onEvent: (event) => cb.onEvent(event),
    }),
  };
  runs.set(key, run);

  for (const oldest of runs.keys()) {
    if (runs.size <= MAX_SUSPENDED_RUNS) break;
    if (oldest === key) continue;
    runs.get(oldest)?.runner.stop();
    runs.delete(oldest);
  }

  return run;
}

/**
 * Point a run's callbacks at the table that is currently mounted.
 *
 * A function rather than a mutable handle because the caller is a hook: the run
 * it holds is memoised, and writing through it there is the kind of aliasing
 * `react-hooks/immutability` exists to catch.
 */
export function setRunCallbacks(key: string, cb: Partial<StackerRunCallbacks>): void {
  const run = runs.get(key);
  if (!run) return;
  Object.assign(run.cb, cb);
}

/** Drop a run for good — the match is over, or the table was cancelled. */
export function releaseRun(key: string): void {
  const run = runs.get(key);
  if (!run) return;
  run.runner.stop();
  runs.delete(key);
}

/** Test seam. */
export function clearRuns(): void {
  for (const run of runs.values()) run.runner.stop();
  runs.clear();
}

export function suspendedRunCount(): number {
  return runs.size;
}
