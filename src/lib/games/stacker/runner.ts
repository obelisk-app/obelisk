/**
 * The thing that actually runs a match on your machine.
 *
 * This is deliberately not a React hook and holds no React state. The first
 * version drove the board through React - a store notification every frame, a
 * re-render of the table, a canvas redraw from props - and it stuttered,
 * because sixty reconciliations a second is sixty reconciliations a second.
 *
 * So the split is:
 *
 *   - **hot path** (60 Hz): the engine steps, and `onFrame` subscribers draw.
 *     No React involved. The canvas subscribes directly.
 *   - **cold path** (~8 Hz): scores, combo, incoming count - the numbers a
 *     human reads. React re-renders on these, and only these.
 *   - **outbound** (~4 Hz): attacks and checkpoints leave on a timer, never
 *     inside a frame. Signing an event takes milliseconds with a local key and
 *     can take a *lot* longer with a browser extension, and doing it between
 *     two frames is exactly what made sending feel like a stutter.
 *
 * Attacks are coalesced while queued: three quick clears become one event with
 * the lines summed, which is fewer signatures, fewer publishes, and the same
 * garbage arriving at the other end.
 */
import { canFall, createState, stackHeight, step, type GameState, type Input, type InputKind } from './engine';
import type { AttackEvent } from './match';
import { RunnerOutbox } from './runner-outbox';
import {
  ARR_FRAMES,
  DAS_FRAMES,
  FLUSH_INTERVAL_MS,
  FRAME_MS,
  LOCK_DELAY_FRAMES,
  LOCK_RESETS,
  STATS_INTERVAL_MS,
  gravityFramesFor,
  levelFor,
  type StackerRunnerOptions,
  type StackerStats,
} from './runner-config';

export {
  ARR_FRAMES,
  BASE_GRAVITY_FRAMES,
  DAS_FRAMES,
  DEFAULT_STACKER_KEYS,
  GRAVITY_BY_LEVEL,
  LINES_PER_LEVEL,
  LOCK_DELAY_FRAMES,
  LOCK_RESETS,
  STACKER_KEYS,
  gravityFramesFor,
  levelFor,
  type StackerRunnerOptions,
  type StackerSoundEvent,
  type StackerStats,
} from './runner-config';

export class StackerRunner {
  state: GameState;
  frame = 0;

  private log: Input[] = [];
  private held = new Map<InputKind, { since: number; last: number }>();
  private gravity = 0;
  private grounded = 0;
  private lockResets = 0;
  private appliedAttacks = new Set<string>();
  private reportedDeath = false;

  private raf: number | null = null;
  private lastTick = 0;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  private frameListeners = new Set<(state: GameState) => void>();
  private statsListeners = new Set<(stats: StackerStats) => void>();

  private readonly outbox: RunnerOutbox;
  private lastClear: StackerStats['lastClear'] = null;

  private running = false;

  constructor(private opts: StackerRunnerOptions) {
    this.state = createState(opts.seed);
    this.outbox = new RunnerOutbox(opts);
  }

  /* ── lifecycle ──────────────────────────────────────────────────────── */

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTick = 0;
    this.raf = requestAnimationFrame(this.tick);
    this.statsTimer = setInterval(() => this.emitStats(), STATS_INTERVAL_MS);
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  stop(): void {
    this.running = false;
    // The keyup that would have cleared these is gone with the listeners, so a
    // key still down when the table closes would otherwise auto-repeat from
    // the moment the run resumes.
    this.held.clear();
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    if (this.statsTimer) clearInterval(this.statsTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.raf = null;
    this.statsTimer = null;
    this.flushTimer = null;
    // Anything still queued goes out now rather than being lost on unmount.
    this.flush();
  }

  /* ── subscriptions ──────────────────────────────────────────────────── */

  /** Every frame. For canvases; never for React state. */
  onFrame(listener: (state: GameState) => void): () => void {
    this.frameListeners.add(listener);
    listener(this.state);
    return () => { this.frameListeners.delete(listener); };
  }

  /** The readable numbers, a few times a second. Safe for React. */
  onStats(listener: (stats: StackerStats) => void): () => void {
    this.statsListeners.add(listener);
    listener(this.stats());
    return () => { this.statsListeners.delete(listener); };
  }

  stats(): StackerStats {
    return {
      linesCleared: this.state.linesCleared,
      attacksSent: this.state.attacksSent,
      incoming: this.state.incoming.reduce((n, g) => n + g.lines, 0),
      combo: this.state.combo,
      backToBack: this.state.backToBack,
      stackHeight: stackHeight(this.state),
      level: levelFor(this.state.linesCleared),
      dead: this.state.dead,
      frame: this.frame,
      lastClear: this.lastClear,
    };
  }

  /* ── input ──────────────────────────────────────────────────────────── */

  press(kind: InputKind): void {
    if (this.state.dead) return;
    if (this.held.has(kind)) return;
    this.held.set(kind, { since: this.frame, last: this.frame });
    this.apply({ frame: this.frame, kind });
    // Sliding or spinning a landed piece buys a little more time, to a limit.
    if (kind !== 'hard' && this.grounded > 0 && this.lockResets < LOCK_RESETS) {
      this.grounded = 0;
      this.lockResets += 1;
    }
    if (kind === 'left' || kind === 'right') this.opts.onEvent?.({ kind: 'move' });
    else if (kind === 'cw' || kind === 'ccw' || kind === 'flip') this.opts.onEvent?.({ kind: 'rotate' });
    else if (kind === 'hold') this.opts.onEvent?.({ kind: 'hold' });
    else if (kind === 'hard') this.opts.onEvent?.({ kind: 'drop' });
    // A key press must show up on the very next paint, not at the next
    // stats tick - that delay is what makes controls feel mushy.
    this.emitFrame();
  }

  release(kind: InputKind): void {
    this.held.delete(kind);
  }

  /** Garbage that arrived from the relay. */
  receive(attacks: readonly AttackEvent[]): void {
    let landed = 0;
    for (const attack of attacks) {
      const key = `${attack.from}:${attack.nonce}:${attack.at}`;
      if (this.appliedAttacks.has(key)) continue;
      this.appliedAttacks.add(key);
      this.apply({ frame: this.frame, kind: 'garbage', lines: attack.lines, hole: attack.hole });
      landed += attack.lines;
    }
    if (landed > 0) {
      this.opts.onEvent?.({ kind: 'garbage', lines: landed });
      this.emitFrame();
      this.emitStats();
    }
  }

  /* ── the loop ───────────────────────────────────────────────────────── */

  private apply(input: Input): void {
    this.log.push(input);
    const before = this.state.clears.length;
    step(this.state, input);
    const clear = this.state.clears[this.state.clears.length - 1];
    if (this.state.clears.length > before && clear) {
      this.lastClear = { lines: clear.lines, spin: clear.spin, attack: clear.attack, at: this.frame };
      this.opts.onEvent?.({
        kind: 'clear',
        lines: clear.lines,
        spin: clear.spin,
        combo: this.state.combo,
      });
      if (clear.attack > 0) this.outbox.addAttack(clear.attack);
    }
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.lastTick === 0) this.lastTick = now;
    // Catch up in whole frames, capped so a backgrounded tab does not resume
    // by simulating half a minute of gravity at once.
    const elapsed = Math.min(now - this.lastTick, FRAME_MS * 8);
    let steps = Math.floor(elapsed / FRAME_MS);
    if (steps <= 0) return;
    this.lastTick += steps * FRAME_MS;

    if (this.state.dead) {
      if (!this.reportedDeath) {
        this.reportedDeath = true;
        this.opts.onEvent?.({ kind: 'topout' });
        this.opts.onTopOut();
        this.emitStats();
      }
      return;
    }

    while (steps-- > 0) {
      this.frame += 1;

      for (const [kind, held] of this.held) {
        if (kind !== 'left' && kind !== 'right' && kind !== 'soft') continue;
        if (this.frame - held.since < DAS_FRAMES) continue;
        if (this.frame - held.last < ARR_FRAMES) continue;
        held.last = this.frame;
        this.apply({ frame: this.frame, kind });
      }

      // Gravity quickens with every ten lines cleared.
      const gravityFrames = gravityFramesFor(this.state.linesCleared);
      this.gravity += 1;
      if (this.gravity >= gravityFrames) {
        this.gravity = 0;
        if (canFall(this.state)) this.apply({ frame: this.frame, kind: 'gravity' });
      }

      // Lock delay: a landed piece gets a moment before it cements.
      if (this.state.active && !canFall(this.state)) {
        this.grounded += 1;
        if (this.grounded >= LOCK_DELAY_FRAMES) {
          this.apply({ frame: this.frame, kind: 'gravity' });
          this.grounded = 0;
          this.lockResets = 0;
          this.opts.onEvent?.({ kind: 'lock' });
        }
      } else {
        this.grounded = 0;
      }

      if (this.state.dead) break;
    }

    this.outbox.markDue(this.frame);

    this.emitFrame();
  };

  /** Everything outbound leaves on its own timer, off the frame path. */
  private flush(): void {
    this.outbox.flush(this.frame, this.state, this.log);
  }

  private emitFrame(): void {
    for (const listener of this.frameListeners) listener(this.state);
  }

  private emitStats(): void {
    // The clear banner fades on its own rather than needing a timer per clear.
    if (this.lastClear && this.frame - this.lastClear.at > 90) this.lastClear = null;
    const stats = this.stats();
    for (const listener of this.statsListeners) listener(stats);
  }
}
