import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireRun, clearRuns, releaseRun, suspendedRunCount, MAX_SUSPENDED_RUNS } from './run-registry';

afterEach(() => clearRuns());

describe('stacker run registry', () => {
  it('hands back the same run for the same match, so closing the table suspends it', () => {
    const first = acquireRun('table-1:seat-a', 1234);
    first.runner.press('hard');
    first.runner.press('hard');
    const board = first.runner.state.board.slice();
    first.runner.stop();

    const again = acquireRun('table-1:seat-a', 1234);

    expect(again.runner).toBe(first.runner);
    expect(again.runner.state.board).toEqual(board);
  });

  it('keeps separate runs per seat', () => {
    const a = acquireRun('table-1:seat-a', 1234);
    const b = acquireRun('table-1:seat-b', 1234);
    expect(a.runner).not.toBe(b.runner);
  });

  it('starts fresh when the seed changes — a rematch is not a resume', () => {
    const first = acquireRun('table-1:seat-a', 1234);
    first.runner.press('hard');
    const rematch = acquireRun('table-1:seat-a', 9999);

    expect(rematch.runner).not.toBe(first.runner);
    expect(rematch.runner.frame).toBe(0);
  });

  it('routes callbacks to whichever table is currently mounted', () => {
    const run = acquireRun('table-1:seat-a', 1234);
    const stale = vi.fn();
    const live = vi.fn();

    run.cb.onTopOut = stale;
    run.cb.onTopOut = live;
    run.runner.state.dead = true;
    // The runner calls through `cb`, never a captured closure.
    run.cb.onTopOut();

    expect(stale).not.toHaveBeenCalled();
    expect(live).toHaveBeenCalled();
  });

  it('drops a released run', () => {
    const first = acquireRun('table-1:seat-a', 1234);
    first.runner.press('hard');
    releaseRun('table-1:seat-a');

    expect(suspendedRunCount()).toBe(0);
    expect(acquireRun('table-1:seat-a', 1234).runner).not.toBe(first.runner);
  });

  it('caps abandoned runs rather than growing forever', () => {
    for (let i = 0; i < MAX_SUSPENDED_RUNS + 3; i += 1) {
      acquireRun(`table-${i}:seat-a`, 1000 + i);
    }
    expect(suspendedRunCount()).toBe(MAX_SUSPENDED_RUNS);
  });

  it('keeps the run in use when evicting', () => {
    const keep = acquireRun('table-keep:seat-a', 1);
    for (let i = 0; i < MAX_SUSPENDED_RUNS + 2; i += 1) {
      acquireRun(`table-${i}:seat-a`, 1000 + i);
      // Touch the run in use, as a mounted table does every time it remounts.
      acquireRun('table-keep:seat-a', 1);
    }
    expect(acquireRun('table-keep:seat-a', 1).runner).toBe(keep.runner);
  });
});
