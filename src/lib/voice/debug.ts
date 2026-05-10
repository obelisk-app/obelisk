/**
 * Tiny ring-buffer of voice-layer events, mirrored to `window.__obeliskVoiceDebug`
 * so the Playwright harness and the in-app `?debug=voice` overlay can read
 * them without instrumenting each call site individually.
 *
 * `window.__obeliskVoiceMetrics` is the live `VoiceMetrics` object the
 * `VoiceClient` mutates — assigning the reference once, not the values,
 * so updates propagate without copy.
 */
import type { VoiceMetrics } from './metrics';

export type VoiceDebugReason =
  | 'wot'
  | 'membership-deferred'
  | 'membership-final'
  | 'self'
  | 'not-for-me'
  | 'unknown-payload'
  | 'sfu-routed'
  | 'deferred-overflow'
  | 'consume-retry'
  | 'consume-failed'
  | 'stale-consumer';

export interface VoiceDebugEvent {
  ts: number;
  kind:
    | 'beacon-sent' | 'beacon-rcvd'
    | 'signal-sent' | 'signal-rcvd' | 'signal-dropped'
    | 'pc-state'
    | 'control-open' | 'control-msg' | 'control-dead'
    | 'peer-discovered' | 'peer-torn-down'
    | 'relay-error'
    | 'sfu-reliability';
  reason?: VoiceDebugReason;
  peer?: string;
  payload?: unknown;
}

const RING_SIZE = 500;

interface DebugBag {
  events: VoiceDebugEvent[];
  metrics: VoiceMetrics | null;
}

function ensureBag(): DebugBag {
  const w = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
    __obeliskVoiceDebug?: DebugBag;
  };
  if (!w.__obeliskVoiceDebug) {
    w.__obeliskVoiceDebug = { events: [], metrics: null };
  }
  return w.__obeliskVoiceDebug;
}

export function setVoiceMetricsRef(metrics: VoiceMetrics): void {
  const bag = ensureBag();
  bag.metrics = metrics;
  // Mirror to a top-level window property too — same reference — so tests
  // can pick whichever lookup path they prefer.
  if (typeof window !== 'undefined') {
    (window as unknown as { __obeliskVoiceMetrics?: VoiceMetrics }).__obeliskVoiceMetrics = metrics;
  }
}

export function pushVoiceDebug(ev: Omit<VoiceDebugEvent, 'ts'>): void {
  const bag = ensureBag();
  bag.events.push({ ts: Date.now(), ...ev });
  // Bounded ring — drop oldest beyond RING_SIZE.
  if (bag.events.length > RING_SIZE) {
    bag.events.splice(0, bag.events.length - RING_SIZE);
  }
}

export function clearVoiceDebug(): void {
  const bag = ensureBag();
  bag.events.length = 0;
}
