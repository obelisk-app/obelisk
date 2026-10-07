import { afterEach, describe, expect, it } from 'vitest';
import { clearVoiceDebug, pushVoiceDebug, setVoiceMetricsRef } from '@/services/voice/debug';
import { emptyVoiceMetrics } from '@/services/voice/metrics';
import { readVoiceDebugSnapshot } from '@/services/voice/debug-snapshot';
import { VOICE_DEBUG_SHOWN_EVENTS } from '@/constants/voice/debug-snapshot';

const w = window as unknown as { __obeliskVoiceDebug?: unknown };
afterEach(() => { clearVoiceDebug(); delete w.__obeliskVoiceDebug; });

describe('readVoiceDebugSnapshot', () => {
  it('is empty without a bag, and does not create one', () => {
    delete w.__obeliskVoiceDebug;
    expect(readVoiceDebugSnapshot()).toEqual({ metrics: null, events: [] });
    expect(w.__obeliskVoiceDebug).toBeUndefined();
  });

  it('returns the metrics and the newest events first, capped', () => {
    const metrics = emptyVoiceMetrics();
    setVoiceMetricsRef(metrics);
    for (let i = 0; i < VOICE_DEBUG_SHOWN_EVENTS + 5; i += 1) pushVoiceDebug({ kind: 'pc-state', payload: String(i) });
    const snap = readVoiceDebugSnapshot();
    expect(snap.metrics).toBe(metrics);
    expect(snap.events).toHaveLength(VOICE_DEBUG_SHOWN_EVENTS);
    expect(snap.events[0].payload).toBe(String(VOICE_DEBUG_SHOWN_EVENTS + 4));
  });
});
