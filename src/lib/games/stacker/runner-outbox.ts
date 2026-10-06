/**
 * What a Stacker run sends out, off the frame path: attacks summed while they
 * wait (same garbage, one signature), the frequent board snapshot, and the
 * occasional checkpoint that carries the whole input log as proof.
 */
import { encodeBoard, stackHeight, type GameState, type Input } from './engine';
import { CHECKPOINT_INTERVAL_FRAMES, encodeInputs } from './match';
import { BOARD_INTERVAL_FRAMES, type StackerRunnerOptions } from './runner-config';

export class RunnerOutbox {
  /** Attack lines waiting to be published, summed. */
  private pendingAttack = 0;
  private pendingCheckpoint = false;
  private pendingBoard = false;
  private lastCheckpointFrame = 0;
  private lastBoardFrame = 0;

  constructor(private readonly opts: Pick<StackerRunnerOptions, 'onAttack' | 'onCheckpoint'>) {}

  addAttack(lines: number): void {
    this.pendingAttack += lines;
  }

  /** After a tick: note which periodic snapshots have come due. */
  markDue(frame: number): void {
    if (frame - this.lastCheckpointFrame >= CHECKPOINT_INTERVAL_FRAMES) {
      this.lastCheckpointFrame = frame;
      this.pendingCheckpoint = true;
    }
    if (frame - this.lastBoardFrame >= BOARD_INTERVAL_FRAMES) {
      this.lastBoardFrame = frame;
      this.pendingBoard = true;
    }
  }

  /**
   * Everything outbound leaves here, on its own timer, off the frame path.
   * Queued attacks are summed into one event: same garbage, one signature.
   */
  flush(frame: number, state: GameState, log: readonly Input[]): void {
    if (this.pendingAttack > 0) {
      const lines = this.pendingAttack;
      this.pendingAttack = 0;
      // The hole column travels with the attack, so the receiver's board and
      // any later replay of it agree on where the gap was.
      this.opts.onAttack(lines, Math.floor(Math.random() * 10), frame);
    }
    // The verification checkpoint carries the whole input log; the frequent
    // one carries only the board. Both go out as one event when they coincide.
    if (this.pendingCheckpoint || this.pendingBoard) {
      const withProof = this.pendingCheckpoint;
      this.pendingCheckpoint = false;
      this.pendingBoard = false;
      this.opts.onCheckpoint({
        frame,
        attacksSent: state.attacksSent,
        linesCleared: state.linesCleared,
        stackHeight: stackHeight(state),
        board: encodeBoard(state),
        ...(withProof ? { inputs: encodeInputs(log) } : {}),
      });
    }
  }
}
