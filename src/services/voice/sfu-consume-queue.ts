/**
 * The consume retry queue of an `SfuClient`.
 *
 * Pre-reliability-layer the consume path was a single try/catch that
 * logged a warning on any failure and forgot the producer forever.
 * That was the root cause of the "leave + rejoin to see content"
 * symptom: a single dropped `consume` RPC, an 8 s timeout on a heavy
 * relay, or a transient `NO_PEER` race between the SFU writing peer
 * state and our consume request landing: all of these silently
 * stranded a remote track.
 *
 * The flow:
 *   1. `enqueue` is the single entry point. It dedupes against the
 *      registry (already consumed, `host.hasRemote`) and this queue
 *      (already in flight) so duplicate `newProducer` notifications
 *      collapse cleanly.
 *   2. `attempt` runs the two-phase `consume` + `resumeConsumer`
 *      RPC chain. If `consume` succeeded but `resumeConsumer` failed
 *      we keep the Consumer object on the pending entry and the next
 *      retry only re-issues the resume, no wasted round-trip.
 *   3. Errors are classified by `RpcError.code` (sfu-rpc.ts attaches
 *      it onto the thrown Error). `CANNOT_CONSUME` and `ROOM_FULL` are
 *      permanent (retrying won't help), so we give up immediately
 *      and emit `consume-failed`. Everything else (timeout, NO_PEER,
 *      NO_RECV_TRANSPORT, NO_ROUTER, NO_CONSUMER, network errors)
 *      is treated as transient and retried with the
 *      `CONSUME_RETRY_DELAYS_MS` ladder.
 *   4. After `CONSUME_RETRY_DELAYS_MS.length` attempts we give up,
 *      emit `consume-failed`, and log at error level. The retry queue
 *      protects against transient failures, not permanent ones.
 */
import type { Consumer, Device, RtpParameters, Transport } from 'mediasoup-client/types';

import type { SfuRpc } from './sfu-rpc';
import type { ProducerAppData, SfuReliabilityEvent } from './sfu-types';

/**
 * Backoff ladder for `consume` / `resumeConsumer` retries. 4 attempts
 * spread over ~16 s (500 ms, 1.5 s, 4 s, 10 s). Keeps transient SFU recovery bounded without coupling it to mesh internals. Pre-fix every transient failure
 * was logged-and-forgotten: a single dropped `consume` RPC would
 * silently strand a remote track until the user left and rejoined.
 */
export const CONSUME_RETRY_DELAYS_MS = [500, 1500, 4000, 10000] as const;

interface PendingConsume {
  producerId: string;
  appData: ProducerAppData | null;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
  /**
   * If `consume` succeeded but `resumeConsumer` failed, the Consumer
   * object is reusable; only the resume RPC needs to be retried. We
   * stash it here so the next attempt skips a wasted `consume` round
   * trip. Cleared on permanent error or when we tear the entry down.
   */
  consumer: Consumer | null;
  /** Cached pubkey for telemetry; appData.originPubkey if present. */
  peerPubkey: string;
}

export interface ConsumeQueueHost {
  rpc: Pick<SfuRpc, 'request'>;
  isClosed(): boolean;
  device(): Device | null;
  recvTransport(): Transport | null;
  /** The producer is already consumed and surfaced. */
  hasRemote(producerId: string): boolean;
  /** Both RPC phases succeeded: build the remote track and tell the owner. */
  surface(producerId: string, consumer: Consumer, consumerKind: 'audio' | 'video' | null, appData: ProducerAppData | null): void;
  emitReliability(ev: SfuReliabilityEvent): void;
}

export class ConsumeQueue {
  /**
   * In-flight + scheduled consume attempts, keyed by producerId. An entry
   * exists from the moment we first try to consume a producer until the
   * track is surfaced (success) or we give up (permanent error / ladder
   * exhausted). Duplicate `newProducer` notifications collapse onto the
   * same entry, and `producerClosed` / `peerLeft` cancel the timer so
   * we don't keep retrying a producer the SFU has already torn down.
   */
  private readonly pending = new Map<string, PendingConsume>();

  constructor(private readonly host: ConsumeQueueHost) {}

  has(producerId: string): boolean {
    return this.pending.has(producerId);
  }

  enqueue(producerId: string, appData: ProducerAppData | null): void {
    if (this.host.isClosed()) return;
    if (!this.host.device() || !this.host.recvTransport()) return;
    if (this.host.hasRemote(producerId)) return;
    if (this.pending.has(producerId)) return;
    const entry: PendingConsume = {
      producerId,
      appData,
      attempts: 0,
      timer: null,
      consumer: null,
      peerPubkey: appData?.originPubkey ?? '',
    };
    this.pending.set(producerId, entry);
    void this.attempt(entry);
  }

  cancel(producerId: string): void {
    const entry = this.pending.get(producerId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.consumer) {
      // mediasoup's Consumer.close() returns on an already-closed consumer
      // and otherwise only emits; the guard is for a fake that throws.
      try { entry.consumer.close(); } catch { /* close() does not throw */ }
    }
    this.pending.delete(producerId);
  }

  /** Cancel every in-flight retry for producers from `pubkey`. */
  cancelForPeer(pubkey: string): void {
    for (const [producerId, pending] of Array.from(this.pending.entries())) {
      if (pending.peerPubkey !== pubkey) continue;
      this.cancel(producerId);
    }
  }

  /** Teardown: stop the timers, forget the entries. */
  clear(): void {
    for (const pending of Array.from(this.pending.values())) {
      if (pending.timer) clearTimeout(pending.timer);
      // Don't close the consumer here: we hand it off via `consumer`
      // when consume succeeded but resume failed; the broader teardown
      // closes the recv transport which closes every consumer.
    }
    this.pending.clear();
  }

  private async attempt(entry: PendingConsume): Promise<void> {
    if (this.host.isClosed()) return;
    const device = this.host.device();
    const transport = this.host.recvTransport();
    if (!device || !transport) return;
    // The producer may have been torn down between scheduling and
    // firing (peer left, or a `producerClosed` notification arrived).
    if (!this.pending.has(entry.producerId)) return;
    entry.attempts += 1;
    try {
      // Phase 1: `consume` RPC + `recvTransport.consume`. Skipped if a
      // previous attempt already minted the Consumer and only the
      // resume failed; saves a round-trip and avoids the SFU minting
      // a duplicate consumer it would have to garbage-collect later.
      let consumer = entry.consumer;
      let consumeAppData: ProducerAppData | null = entry.appData;
      let consumerKind: 'audio' | 'video' | null = null;
      if (!consumer) {
        const consumeData = await this.host.rpc.request<{
          id: string;
          producerId: string;
          kind: 'audio' | 'video';
          rtpParameters: RtpParameters;
          appData: ProducerAppData | null;
        }>('consume', {
          producerId: entry.producerId,
          rtpCapabilities: device.rtpCapabilities,
        });
        if (this.host.isClosed() || !this.pending.has(entry.producerId)) {
          // Race: producer closed / client torn down while RPC was in
          // flight. Don't surface a half-built track.
          return;
        }
        consumer = await transport.consume({
          id: consumeData.id,
          producerId: consumeData.producerId,
          kind: consumeData.kind,
          rtpParameters: consumeData.rtpParameters,
        });
        if (this.host.isClosed() || !this.pending.has(entry.producerId)) {
          try { consumer.close(); } catch { /* close() does not throw */ }
          return;
        }
        consumeAppData = consumeData.appData ?? entry.appData;
        consumerKind = consumeData.kind;
        entry.consumer = consumer;
      } else {
        consumerKind = consumer.kind === 'audio' ? 'audio' : 'video';
      }
      // Phase 2: `resumeConsumer` RPC. Server starts consumers paused
      // so the client can prepare its <video> element first.
      await this.host.rpc.request('resumeConsumer', { consumerId: consumer.id });
      if (this.host.isClosed() || !this.pending.has(entry.producerId)) {
        try { consumer.close(); } catch { /* close() does not throw */ }
        return;
      }
      // Success: surface the track and clear the pending entry.
      this.host.surface(entry.producerId, consumer, consumerKind, consumeAppData ?? entry.appData);
      this.pending.delete(entry.producerId);
    } catch (err) {
      if (this.host.isClosed() || !this.pending.has(entry.producerId)) return;
      const code = (err as Error & { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      if (this.isPermanentConsumeError(code)) {
        console.error('[sfu] consume permanently failed', entry.producerId, code, message);
        this.host.emitReliability({
          kind: 'consume-failed',
          producerId: entry.producerId,
          peerPubkey: entry.peerPubkey || undefined,
          attempt: entry.attempts,
          errorCode: code,
          errorMessage: message,
        });
        this.cancel(entry.producerId);
        return;
      }
      if (entry.attempts >= CONSUME_RETRY_DELAYS_MS.length) {
        console.error('[sfu] consume gave up after', entry.attempts, 'attempts', entry.producerId, message);
        this.host.emitReliability({
          kind: 'consume-failed',
          producerId: entry.producerId,
          peerPubkey: entry.peerPubkey || undefined,
          attempt: entry.attempts,
          errorCode: code,
          errorMessage: message,
        });
        this.cancel(entry.producerId);
        return;
      }
      const delay = CONSUME_RETRY_DELAYS_MS[entry.attempts - 1] ?? CONSUME_RETRY_DELAYS_MS[CONSUME_RETRY_DELAYS_MS.length - 1];
      console.warn('[sfu] consume failed; retrying in', delay, 'ms', entry.producerId, code ?? '', message);
      this.host.emitReliability({
        kind: 'consume-retry',
        producerId: entry.producerId,
        peerPubkey: entry.peerPubkey || undefined,
        attempt: entry.attempts,
        errorCode: code,
        errorMessage: message,
      });
      entry.timer = setTimeout(() => {
        entry.timer = null;
        void this.attempt(entry);
      }, delay);
    }
  }

  /**
   * Permanent error codes: retrying these is wasted effort. Everything
   * else (timeouts, NO_PEER / NO_RECV_TRANSPORT / NO_ROUTER / NO_CONSUMER
   * races, network errors with no code) is transient and goes through
   * the backoff ladder.
   */
  private isPermanentConsumeError(code: string | undefined): boolean {
    return code === 'CANNOT_CONSUME' || code === 'ROOM_FULL';
  }
}
