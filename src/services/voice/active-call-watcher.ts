/**
 * Watches the bridge's `activeCallByChannel` store for one channel.
 *
 * Two consumers share it. In mesh mode the entry's `participantPubkeys`
 * are a second discovery source (the same kind 20078 beacons the pre-join
 * UI shows), handed to the mesh session as passive hints. In SFU mode the
 * entry disappearing, or flipping away from `active`, is the SFU's kind
 * 31314 closure (graceful restart, watchdog auto-heal, duration cap); the
 * SFU session reacts to it ~13 s before the SFU's beacon would have aged
 * out of a roster.
 *
 * The bridge is async to obtain, so `start()` resolves it in the
 * background and a `stop()` that lands first cancels the pending
 * subscription instead of leaking it.
 */
import { getBridge } from '@/services/nostr-bridge';

type Bridge = Awaited<ReturnType<typeof getBridge>>;
type ActiveCallByChannel = Parameters<Parameters<Bridge['subscribeActiveCallByChannel']>[0]>[0];
export type ActiveCallEntry = ActiveCallByChannel[string];

export interface ActiveCallWatcherHandlers {
  /** Every snapshot, before the closure logic runs. `entry` is absent when the channel has no call. */
  onEntry(entry: ActiveCallEntry | undefined): void;
  /**
   * The entry was `active`/`starting` at least once since `start()` and is
   * no longer. Armed only after an active sighting so a snapshot that lands
   * before the SFU has published 31314 cannot trip a phantom recovery.
   */
  onClosed(): void;
}

export class ActiveCallWatcher {
  private unsub: (() => void) | null = null;
  private seenActive = false;

  constructor(
    private readonly channelId: string,
    private readonly handlers: ActiveCallWatcherHandlers,
  ) {}

  get running(): boolean {
    return this.unsub !== null;
  }

  start(): void {
    if (this.unsub) return;
    this.seenActive = false;
    let cancelled = false;
    // A placeholder so a stop() during the bridge resolve has something to
    // call and the watcher reads as "running" in the meantime.
    this.unsub = () => { cancelled = true; };
    void (async () => {
      let bridge: Bridge;
      try { bridge = await getBridge(); } catch (err) {
        // Without the bridge we cannot see kind 31314; an SFU restart would
        // then go unnoticed until the user leaves. Say so.
        console.warn('[voice] active-call watcher could not reach the bridge', err);
        return;
      }
      if (cancelled) return;
      const realUnsub = bridge.subscribeActiveCallByChannel((byChannel) => {
        const entry = byChannel[this.channelId];
        this.handlers.onEntry(entry);
        if (entry && (entry.status === 'active' || entry.status === 'starting')) {
          this.seenActive = true;
          return;
        }
        if (!this.seenActive) return;
        this.handlers.onClosed();
      });
      if (cancelled) {
        try { realUnsub(); } catch { /* unsubscribing a sub we are discarding */ }
        return;
      }
      this.unsub = realUnsub;
    })();
  }

  stop(): void {
    try { this.unsub?.(); } catch (err) {
      // A bridge StateStore unsubscribe cannot throw today; if one ever
      // does, the watcher is still considered stopped, but say so.
      console.warn('[voice] active-call watcher unsubscribe threw', err);
    }
    this.unsub = null;
    this.seenActive = false;
  }
}
