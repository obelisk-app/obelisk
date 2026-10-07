import { useEffect, useState } from 'react';
import { readVoiceDebugSnapshot } from '@/services/voice/debug-snapshot';
import { VOICE_DEBUG_REFRESH_MS } from '@/constants/voice/room';

/**
 * The voice debug overlay's view model: a render tick every 500 ms (no
 * React state for the metrics object itself) and the bag's snapshot read
 * on each render.
 */
export function useDebugOverlay() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), VOICE_DEBUG_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  return { tick, ...readVoiceDebugSnapshot() };
}
