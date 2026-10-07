/**
 * Inbound signals from peers not yet known to be members, held until
 * `updateRoles()` admits the sender or a TTL expires.
 *
 * Without this queue the receiver-side membership filter silently dropped
 * the very first kind 25050 from any peer whose 39002 snapshot landed a few
 * hundred ms after their first SDP offer, a common cold-start timing where
 * membership and voice signals race through the bridge. Bounded per peer
 * and in total so a malicious flood cannot blow memory.
 */
import type { VoiceSignalPayload } from './types';
import type { VoiceMetrics } from './metrics';
import { pushVoiceDebug } from './debug';
import {
  DEFERRED_SIGNAL_PER_PEER_CAP,
  DEFERRED_SIGNAL_SWEEP_MS,
  DEFERRED_SIGNAL_TOTAL_CAP,
  DEFERRED_SIGNAL_TTL_MS,
} from '@/constants/voice/client';

interface Entry {
  payload: VoiceSignalPayload;
  arrivedAt: number;
}

export class DeferredSignalQueue {
  private readonly queues = new Map<string, Entry[]>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly metrics: VoiceMetrics) {}

  /** Queue a signal from `from`. Starts the periodic sweep on first use. */
  defer(from: string, payload: VoiceSignalPayload): void {
    let total = 0;
    for (const arr of this.queues.values()) total += arr.length;
    if (total >= DEFERRED_SIGNAL_TOTAL_CAP) {
      // Total cap exceeded: drop the OLDEST entry across all peers
      // before queueing this one. Bounds memory under a flood of
      // unknown-peer signaling without losing the most recent state.
      let oldestPeer: string | null = null;
      let oldestAt = Number.MAX_SAFE_INTEGER;
      for (const [pk, arr] of this.queues) {
        if (arr.length === 0) continue;
        if (arr[0].arrivedAt < oldestAt) {
          oldestAt = arr[0].arrivedAt;
          oldestPeer = pk;
        }
      }
      if (oldestPeer) {
        this.queues.get(oldestPeer)!.shift();
        this.metrics.signalsDropped.deferredOverflow++;
      }
    }
    let arr = this.queues.get(from);
    if (!arr) {
      arr = [];
      this.queues.set(from, arr);
    }
    if (arr.length >= DEFERRED_SIGNAL_PER_PEER_CAP) {
      arr.shift(); // drop oldest for this peer
      this.metrics.signalsDropped.deferredOverflow++;
    }
    arr.push({ payload, arrivedAt: Date.now() });
    this.metrics.signalsDropped.membershipDeferred++;
    pushVoiceDebug({ kind: 'signal-dropped', reason: 'membership-deferred', peer: from, payload });
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweep(), DEFERRED_SIGNAL_SWEEP_MS);
    }
  }

  /** Hand every queued signal from a now-admitted peer to `deliver`, in arrival order. */
  drain(isMember: (pubkey: string) => boolean, deliver: (from: string, payload: VoiceSignalPayload) => void): void {
    if (this.queues.size === 0) return;
    for (const [from, arr] of Array.from(this.queues.entries())) {
      if (!isMember(from)) continue;
      this.queues.delete(from);
      for (const { payload } of arr) deliver(from, payload);
    }
    this.stopSweepIfEmpty();
  }

  /** Drop entries past the TTL; bump `membershipFinal` for each. */
  private sweep(): void {
    const cutoff = Date.now() - DEFERRED_SIGNAL_TTL_MS;
    for (const [from, arr] of Array.from(this.queues.entries())) {
      let removed = 0;
      while (arr.length > 0 && arr[0].arrivedAt < cutoff) {
        arr.shift();
        removed++;
      }
      if (removed > 0) {
        this.metrics.signalsDropped.membershipFinal += removed;
        pushVoiceDebug({ kind: 'signal-dropped', reason: 'membership-final', peer: from, payload: { dropped: removed } });
        console.warn('[voice-drop] membership-final', from.slice(0, 8), 'dropped=', removed);
      }
      if (arr.length === 0) this.queues.delete(from);
    }
    this.stopSweepIfEmpty();
  }

  /** Forget everything and stop the sweep. Used by `leave()`. */
  clear(): void {
    this.queues.clear();
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private stopSweepIfEmpty(): void {
    if (this.queues.size === 0 && this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }
}
