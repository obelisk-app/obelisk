/** Bounded, metadata-only wire counters. No event bodies, filters or credentials retained. */
import { TextCoercingWebSocket } from '@nostr-wot/data';

interface TrafficCounts {
  openedAt: number;
  sent: number;
  received: number;
  sentBytes: number;
  receivedBytes: number;
  frames: Record<string, number>;
}
const sockets = new Map<number, TrafficCounts & { relay: string; closed: boolean }>();
let sequence = 0;

export function readRelayTraffic() {
  return [...sockets.entries()].map(([socket, value]) => ({ socket, ...value, frames: { ...value.frames } }));
}

function record(counts: TrafficCounts, direction: 'send' | 'receive', data: unknown): void {
  const text = typeof data === 'string' ? data : null;
  const bytes = text ? new TextEncoder().encode(text).byteLength
    : data instanceof ArrayBuffer ? data.byteLength : typeof Blob !== 'undefined' && data instanceof Blob ? data.size : 0;
  if (direction === 'send') { counts.sent++; counts.sentBytes += bytes; }
  else { counts.received++; counts.receivedBytes += bytes; }
  // Only the protocol verb is read; message strings never become metric keys.
  const verb = text?.match(/^\s*\[\s*"(REQ|CLOSE|EVENT|AUTH|OK|EOSE|CLOSED|NOTICE|COUNT)"/)?.[1] ?? 'other';
  const key = `${direction}:${verb}`;
  counts.frames[key] = (counts.frames[key] ?? 0) + 1;
}

export class MeasuredRelayWebSocket extends TextCoercingWebSocket {
  private readonly counts: TrafficCounts & { relay: string; closed: boolean };

  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    const parsed = new URL(url);
    // No URL credentials/query tokens. A socket has its own row across reconnects.
    this.counts = { relay: parsed.host, closed: false, openedAt: Date.now(), sent: 0, received: 0, sentBytes: 0, receivedBytes: 0, frames: {} };
    sockets.set(++sequence, this.counts);
    if (sockets.size > 64) sockets.delete(sockets.keys().next().value!);
    this.addEventListener('message', (event) => record(this.counts, 'receive', event.data));
    this.addEventListener('close', () => { this.counts.closed = true; });
    if (typeof window !== 'undefined') {
      (window as unknown as { __obeliskRelayTraffic: typeof readRelayTraffic }).__obeliskRelayTraffic = readRelayTraffic;
    }
  }

  override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    super.send(data);
    record(this.counts, 'send', data);
  }
}
