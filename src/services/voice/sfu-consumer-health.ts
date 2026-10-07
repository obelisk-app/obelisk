/**
 * The stale-consumer watchdog of an `SfuClient`.
 *
 * Some failures leave a consumer "live" with zero bytes flowing:
 * a paused-then-orphaned consumer if `resumeConsumer` raced with a
 * server-side state flush, an ICE path that nominated but stopped
 * forwarding, or a brief codec hiccup that never recovered. The
 * browser's own `trackended` only fires after ~10 s of dead RTP and
 * *only if RTP started in the first place*; if it never started,
 * `trackended` never fires. We watchdog on `getStats()` so the
 * dex notices and rebuilds the consumer instead of waiting for the
 * user to leave and rejoin.
 */
import type { ProducerAppData, SfuRemoteTrack } from './sfu-types';
import {
  STALE_CHECK_INTERVAL_MS,
  STALE_TIMEOUT_MS,
  STALE_WARMUP_MS,
} from '@/constants/voice/sfu-consumer-health';

interface ConsumerHealth {
  producerId: string;
  appData: ProducerAppData | null;
  createdAt: number;
  lastBytesReceived: number;
  lastProgressAt: number;
  /** `getStats()` has already been reported as failing for this consumer. */
  statsWarned: boolean;
}

export interface ConsumerHealthHost {
  isClosed(): boolean;
  /** The surfaced consumers, by producer id. */
  remotes(): ReadonlyMap<string, SfuRemoteTrack>;
  /**
   * A consumer is wedged. Its health entry is already forgotten; the host
   * drops the remote track, closes the consumer and re-issues `consume`.
   */
  onStale(producerId: string, remote: SfuRemoteTrack, appData: ProducerAppData | null): void;
}

export class ConsumerHealthWatch {
  /**
   * Per-consumer RTP-flow tracking for the stale watchdog. We compare
   * the latest `inbound-rtp.bytesReceived` snapshot against the last
   * one we saw; if it doesn't move for STALE_TIMEOUT_MS we consider
   * the consumer wedged and rebuild it.
   */
  private readonly health = new Map<string, ConsumerHealth>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly host: ConsumerHealthHost) {}

  /** A consumer was surfaced: start measuring it. */
  track(consumerId: string, producerId: string, appData: ProducerAppData | null): void {
    const now = Date.now();
    this.health.set(consumerId, {
      producerId,
      appData,
      createdAt: now,
      lastBytesReceived: 0,
      lastProgressAt: now,
      statsWarned: false,
    });
  }

  forget(consumerId: string): void {
    this.health.delete(consumerId);
  }

  clear(): void {
    this.health.clear();
  }

  start(): void {
    if (this.timer) return;
    if (this.host.isClosed()) return;
    this.timer = setInterval(() => {
      void this.check();
    }, STALE_CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async check(): Promise<void> {
    if (this.host.isClosed()) return;
    const remotes = this.host.remotes();
    if (remotes.size === 0) {
      this.stop();
      return;
    }
    const now = Date.now();
    for (const [producerId, remote] of Array.from(remotes.entries())) {
      const health = this.health.get(remote.consumer.id);
      if (!health) continue;
      if (now - health.createdAt < STALE_WARMUP_MS) continue;
      if (remote.consumer.paused) continue;
      let bytesReceived = 0;
      try {
        const stats = await remote.consumer.getStats();
        bytesReceived = extractInboundBytesReceived(stats);
      } catch (err) {
        // A single getStats() hiccup is noisy in some browsers, so one
        // failed tick is skipped and the next tick retries the read. A
        // consumer whose stats never read is one this watchdog cannot see
        // (a wedge on it would go unrebuilt for the rest of the call), so
        // that is said once per consumer rather than never.
        if (!health.statsWarned) {
          health.statsWarned = true;
          console.warn('[sfu] consumer getStats failed; stale watchdog cannot see this consumer until it reads', producerId, err);
        }
        continue;
      }
      if (bytesReceived > health.lastBytesReceived) {
        health.lastBytesReceived = bytesReceived;
        health.lastProgressAt = now;
        continue;
      }
      if (now - health.lastProgressAt < STALE_TIMEOUT_MS) continue;
      // Wedged. Tear it down and re-enqueue a fresh consume: the
      // server still has the producer (we'd have received producerClosed
      // otherwise). Cache the appData before we drop state.
      const appData = health.appData;
      this.health.delete(remote.consumer.id);
      this.host.onStale(producerId, remote, appData);
    }
  }
}

function extractInboundBytesReceived(stats: RTCStatsReport | Map<string, unknown>): number {
  // RTCStatsReport iterates [id, RTCStats] pairs. We pick the inbound-rtp
  // entry; there's only one per consumer (one m-line). Fall back to 0
  // if the browser hasn't populated the stat yet (very early after
  // consume; STALE_WARMUP_MS is meant to cover this window but a few
  // browsers expose `inbound-rtp` without `bytesReceived` for a tick).
  let bytes = 0;
  stats.forEach((stat: unknown) => {
    if (!stat || typeof stat !== 'object') return;
    const s = stat as { type?: string; bytesReceived?: number };
    if (s.type !== 'inbound-rtp') return;
    if (typeof s.bytesReceived === 'number' && s.bytesReceived > bytes) {
      bytes = s.bytesReceived;
    }
  });
  return bytes;
}
