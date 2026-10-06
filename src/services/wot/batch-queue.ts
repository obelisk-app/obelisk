/**
 * The engine's lookup queue: pubkeys waiting for a verdict, sent to the
 * extension in debounced batches, one batch in flight at a time.
 *
 * One at a time because the extension serves a single request channel. A
 * guard on the timer alone let a second `getDistanceBatch` go out while the
 * first was still awaiting, so two graph traversals competed for that
 * channel and every signature queued behind both.
 */

export class BatchQueue<R> {
  private readonly pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** True while a fetch is outstanding. */
  private flushing = false;
  /** Bumped by {@link cancel} so an in-flight batch's answers are discarded. */
  private generation = 0;

  constructor(
    private readonly debounceMs: number,
    /** Ask for verdicts. A rejection propagates out of the flush. */
    private readonly fetch: (batch: string[]) => Promise<R>,
    /** Answers for a batch that is still current. */
    private readonly deliver: (batch: string[], result: R) => void,
  ) {}

  has(pubkey: string): boolean {
    return this.pending.has(pubkey);
  }

  get size(): number {
    return this.pending.size;
  }

  add(pubkey: string): void {
    if (this.pending.has(pubkey)) return;
    this.pending.add(pubkey);
    this.schedule();
  }

  /**
   * Drop everything queued and disown the batch on the wire. Verdicts are
   * computed against the config in force when the batch left; after a
   * maxHops change, a minPaths change or an account switch those answers
   * describe a traversal nobody asked for any more.
   */
  cancel(): void {
    this.pending.clear();
    this.generation += 1;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Skip the debounce and flush now. */
  flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  private schedule(): void {
    if (this.timer) return;
    if (this.flushing) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    if (this.pending.size === 0) return;
    const batch = Array.from(this.pending);
    this.pending.clear();
    this.flushing = true;
    const generation = this.generation;
    let result: R;
    try {
      result = await this.fetch(batch);
    } finally {
      this.flushing = false;
      // Anything enqueued while we were in flight was blocked from arming a
      // timer by the guard above; re-arm now so it isn't stranded.
      if (this.pending.size > 0) this.schedule();
    }
    if (this.generation !== generation) return;
    this.deliver(batch, result);
  }
}
