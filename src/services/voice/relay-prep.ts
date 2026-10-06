/**
 * What a mesh join asks the bridge for before its first beacon: room on
 * the relay for two more REQs, and a settled NIP-42 AUTH. Both are asks,
 * not requirements: the join goes on when the bridge is unavailable, with
 * the gap said once here and counted where the debug overlay can see it.
 */
import { getBridge } from '@/services/nostr-bridge';
import type { VoiceMetrics } from './metrics';

/**
 * Ask the bridge to trim its background REQs so the roster and signal
 * subscriptions fit under the relay's subscription cap. Resolves to the
 * release function, or null when the bridge cannot be reached: the only
 * later symptom of running without the trim is a rate-limit CLOSE on a
 * voice sub, which the degraded-signaling banner reports without its
 * cause, so the cause is logged here.
 */
export async function reserveVoiceRelayCapacity(channelId: string): Promise<(() => void) | null> {
  try {
    const bridge = await getBridge() as unknown as {
      reserveVoiceRelayCapacity?: (channelId: string) => () => void;
    };
    return bridge.reserveVoiceRelayCapacity?.(channelId) ?? null;
  } catch (err) {
    console.warn('[voice] relay capacity reservation unavailable; mesh subscriptions may hit the relay cap', err);
    return null;
  }
}

/**
 * Record whether NIP-42 AUTH had settled on the active relay. On slower
 * relays the bring-up beacon at t=0 can fire before the relay has accepted
 * our AUTH challenge; the publish is then rejected ("auth-required") and
 * silently lost. This never blocks the first beacon (the bring-up burst
 * covers the AUTH race, and blocking hangs test environments without a
 * real bridge), it only counts the wait and the timeout so the overlay
 * shows the gap. The bridge resolves immediately when AUTH was already
 * complete.
 */
export function recordRelayAuthWait(metrics: VoiceMetrics, timeoutMs = 5_000): void {
  void (async () => {
    try {
      const bridge = await getBridge();
      if (bridge && typeof bridge.waitForRelayAuth === 'function') {
        const result = await bridge.waitForRelayAuth(timeoutMs);
        metrics.relay.authWaited++;
        if (result !== 'ok') metrics.relay.authTimedOut++;
      }
    } catch (err) {
      // The first beacon goes out without the AUTH wait. Count it as a
      // timeout so the debug overlay shows the gap, and say why.
      metrics.relay.authTimedOut++;
      console.warn('[voice] relay AUTH wait unavailable', err);
    }
  })();
}
