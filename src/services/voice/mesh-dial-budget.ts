/** Bound repeated connection rebuilds; successful long-lived calls start fresh. */
export class MeshDialBudget {
  private readonly attempts = new Map<string, { count: number; at: number }>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly retry: () => void) {}

  acquire(pubkey: string): boolean {
    const now = Date.now();
    const previous = this.attempts.get(pubkey);
    const count = previous && now - previous.at < 60_000 ? previous.count : 0;
    // Permit the initial handshake and one immediate session replacement.
    const delay = count < 2 ? 0 : Math.min(1_000 * 2 ** Math.min(count - 2, 5), 30_000);
    const remaining = previous ? previous.at + delay - now : 0;
    if (remaining > 0) {
      if (!this.timers.has(pubkey)) this.timers.set(pubkey, setTimeout(() => {
        this.timers.delete(pubkey);
        this.retry();
      }, remaining));
      return false;
    }
    const timer = this.timers.get(pubkey);
    if (timer) clearTimeout(timer);
    this.timers.delete(pubkey);
    this.attempts.set(pubkey, { count: count + 1, at: now });
    return true;
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.attempts.clear();
  }
}
