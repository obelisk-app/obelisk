/**
 * Read side of the voice debug bag (`debug.ts` writes it): what the
 * `?debug=voice` overlay shows. Reading never creates the bag.
 */
import type { VoiceDebugEvent } from '@/services/voice/debug';
import type { VoiceMetrics } from '@/services/voice/metrics';
import { VOICE_DEBUG_SHOWN_EVENTS } from '@/constants/voice/debug-snapshot';

export interface VoiceDebugSnapshot {
  metrics: VoiceMetrics | null;
  /** Newest first, at most `VOICE_DEBUG_SHOWN_EVENTS`. */
  events: VoiceDebugEvent[];
}

interface DebugBag {
  events: VoiceDebugEvent[];
  metrics: VoiceMetrics | null;
}

/** The current metrics and the newest events, or nothing without a window or a bag. */
export function readVoiceDebugSnapshot(): VoiceDebugSnapshot {
  const bag = typeof window === 'undefined'
    ? null
    : (window as unknown as { __obeliskVoiceDebug?: DebugBag }).__obeliskVoiceDebug ?? null;
  return {
    metrics: bag?.metrics ?? null,
    events: bag?.events.slice(-VOICE_DEBUG_SHOWN_EVENTS).reverse() ?? [],
  };
}
