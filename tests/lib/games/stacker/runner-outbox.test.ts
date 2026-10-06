import { describe, expect, it, vi } from 'vitest';
import { RunnerOutbox } from '@/lib/games/stacker/runner-outbox';
import { BOARD_INTERVAL_FRAMES } from '@/lib/games/stacker/runner-config';
import { CHECKPOINT_INTERVAL_FRAMES } from '@/lib/games/stacker/match';
import { createState } from '@/lib/games/stacker/engine';

function outbox() {
  const onAttack = vi.fn();
  const onCheckpoint = vi.fn();
  return { box: new RunnerOutbox({ onAttack, onCheckpoint }), onAttack, onCheckpoint };
}

describe('RunnerOutbox', () => {
  it('sends nothing when nothing is queued or due', () => {
    const { box, onAttack, onCheckpoint } = outbox();
    box.flush(10, createState(1), []);
    expect(onAttack).not.toHaveBeenCalled();
    expect(onCheckpoint).not.toHaveBeenCalled();
  });

  it('sums queued attacks into one event and then forgets them', () => {
    const { box, onAttack } = outbox();
    box.addAttack(2);
    box.addAttack(3);
    box.flush(40, createState(1), []);
    box.flush(41, createState(1), []);
    expect(onAttack).toHaveBeenCalledTimes(1);
    expect(onAttack).toHaveBeenCalledWith(5, expect.any(Number), 40);
  });

  it('a board snapshot goes out without the input log; a checkpoint carries it', () => {
    const { box, onCheckpoint } = outbox();
    box.markDue(BOARD_INTERVAL_FRAMES);
    box.flush(BOARD_INTERVAL_FRAMES, createState(1), [{ frame: 1, kind: 'left' }]);
    expect(onCheckpoint.mock.calls[0][0]).not.toHaveProperty('inputs');

    box.markDue(CHECKPOINT_INTERVAL_FRAMES);
    box.flush(CHECKPOINT_INTERVAL_FRAMES, createState(1), [{ frame: 1, kind: 'left' }]);
    expect(onCheckpoint.mock.calls[1][0]).toHaveProperty('inputs');
  });
});
