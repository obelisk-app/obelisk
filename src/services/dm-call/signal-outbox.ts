/**
 * The reliable half of a `CallSignalChannel`: every outbound message is
 * numbered, batched with whatever else is due (and with the acks we owe),
 * and re-sent until the other side acknowledges it. See `signaling.ts` for
 * why: kind 25050 is ephemeral, and a relay forwards it only to the
 * subscriptions open at that instant.
 */
import type { VoiceSignalPayload } from '@/services/voice/types';

/** Coalescing window for outbound messages and acks. */
export const FLUSH_MS = 40;
/** Re-send an unacknowledged message after this long. */
export const RESEND_MS = 1200;
/** Give up on a message after this many sends (~12 s). */
export const MAX_ATTEMPTS = 10;
/** NIP-44 caps plaintext at 64 KiB; stay well clear of it. */
const MAX_BATCH_CHARS = 40_000;

/** What a numbered message carries. */
export type Body = { t: 'hello' } | { t: 'sig'; s: VoiceSignalPayload };

/** One flush: the numbered messages due and the numbers we acknowledge. */
export interface OutboxBatch {
  m?: Array<{ i: number; b: Body }>;
  a?: number[];
}

interface Outgoing {
  body: Body;
  attempts: number;
  lastSentAt: number;
}

export interface OutboxHost {
  /** The peer's key is known: a flush has somewhere to go. */
  canSend(): boolean;
  publish(batch: OutboxBatch): void;
}

export class ReliableOutbox {
  private nextId = 1;
  private outbox = new Map<number, Outgoing>();
  private pendingAcks = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private resendTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly host: OutboxHost) {}

  /** Messages not yet acknowledged. */
  get size(): number {
    return this.outbox.size;
  }

  enqueue(body: Body): void {
    if (this.closed) return;
    this.outbox.set(this.nextId++, { body, attempts: 0, lastSentAt: 0 });
    this.scheduleFlush();
  }

  /** The peer acknowledged these numbers. */
  ack(ids: number[]): void {
    for (const id of ids) this.outbox.delete(id);
    if (this.outbox.size === 0 && this.resendTimer) {
      clearTimeout(this.resendTimer);
      this.resendTimer = null;
    }
  }

  /** A number we owe an ack for on the next flush. */
  acknowledge(id: number): void {
    this.pendingAcks.add(id);
  }

  /**
   * Forget unacknowledged messages that belong to a negotiation we have torn
   * down, so a late re-send can't drag the other side back to it.
   */
  dropSession(sessionId: string): void {
    for (const [id, out] of this.outbox) {
      if (out.body.t === 'sig' && out.body.s.sessionId === sessionId) this.outbox.delete(id);
    }
  }

  scheduleFlush(): void {
    if (this.flushTimer || this.closed) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_MS);
  }

  /** One last flush so a pending bye / ack still leaves, then nothing more. */
  close(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
      this.flush();
    }
    this.closed = true;
    if (this.resendTimer) clearTimeout(this.resendTimer);
  }

  private flush(): void {
    if (this.closed || !this.host.canSend()) return;
    const now = Date.now();
    const due: Array<{ i: number; b: Body }> = [];
    let size = 0;
    for (const [id, out] of this.outbox) {
      if (out.attempts > 0 && now - out.lastSentAt < RESEND_MS * 0.7) continue;
      if (out.attempts >= MAX_ATTEMPTS) {
        // The other side never confirmed it. Whatever depended on it (an
        // offer, a bye) is now waiting on a timeout, so the loss is at
        // least on the console.
        console.warn('[dm-call] signal never acknowledged after', MAX_ATTEMPTS, 'sends; dropped', out.body.t);
        this.outbox.delete(id);
        continue;
      }
      const chars = JSON.stringify(out.body).length;
      if (due.length > 0 && size + chars > MAX_BATCH_CHARS) {
        // The rest goes in the next event, right after this one.
        this.scheduleFlush();
        break;
      }
      size += chars;
      out.attempts++;
      out.lastSentAt = now;
      due.push({ i: id, b: out.body });
    }
    const acks = [...this.pendingAcks];
    this.pendingAcks.clear();
    if (due.length > 0 || acks.length > 0) {
      const batch: OutboxBatch = {};
      if (due.length > 0) batch.m = due;
      if (acks.length > 0) batch.a = acks;
      this.host.publish(batch);
    }
    this.armResend();
  }

  private armResend(): void {
    if (this.resendTimer) clearTimeout(this.resendTimer);
    this.resendTimer = null;
    if (this.outbox.size === 0 || this.closed) return;
    // Jittered, so two sides re-sending at once never fall into lockstep
    // with each other or with a relay's rate-limit window.
    const delay = RESEND_MS * (0.75 + Math.random() * 0.5);
    this.resendTimer = setTimeout(() => {
      this.resendTimer = null;
      this.flush();
    }, delay);
  }
}
