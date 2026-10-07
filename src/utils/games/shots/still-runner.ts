import type { StackerRunner } from '@/lib/games/stacker/runner';
import type { GameState as StackerState } from '@/lib/games/stacker/engine';

/**
 * A paused well: everything `StackerBoard` reads off a runner, none of what
 * it does. The board draws whatever its runner hands it and never asks the
 * runner for anything else, so a still frame is a state plus an `onFrame`
 * that fires once. The cast is the harness admitting it is not a real match.
 */
export function stillRunner(state: StackerState): StackerRunner {
  return {
    state,
    onFrame: (listener: (s: StackerState) => void) => {
      listener(state);
      return () => {};
    },
  } as unknown as StackerRunner;
}
