/**
 * What every voice transport call shares: the publish
 * options that pin a call to its relay and survive NIP-42 `restricted:`,
 * and the voice-priority subscription that outlives quota CLOSEs.
 */
import { resubscribeOnQuotaClose, type BridgeImpl } from '@/services/nostr-bridge';
import { pushVoiceDebug } from './debug';

const VOICE_SUB_WATCHDOG_MS = 2500;

export interface VoiceTransportOptions {
  /**
   * When set, all mesh voice traffic is pinned to this relay instead of the
   * bridge's currently-viewed relay. This keeps an active call's beacons and
   * signaling alive while the user browses other servers.
   */
  relayUrl?: string | null;
  /**
   * A relay closed the roster or signal subscription for quota / rate-limit
   * reasons (`true`) and it is backing off before reopening, or it is being
   * served again (`false`). Lets the UI say "reconnecting" instead of
   * showing a call that silently stopped hearing its peers.
   */
  onSubscriptionDegraded?: (which: 'roster' | 'signals', degraded: boolean) => void;
}

export type VoiceBridge = BridgeImpl;

// `authRetryOnRestricted`: a whitelist relay refuses an EVENT sent before
// NIP-42 AUTH completes with `restricted:`, which nostr-tools never retries.
// Every beacon and signal from a fresh or reconnected socket was lost to it.
function publishOpts(options?: VoiceTransportOptions) {
  return options?.relayUrl
    ? { extraRelays: [options.relayUrl], mode: 'replace' as const, authRetryOnRestricted: true }
    : { authRetryOnRestricted: true };
}

export async function publishViaBridge(
  b: VoiceBridge,
  template: { kind: number; content: string; tags: string[][] },
  options?: VoiceTransportOptions,
  extra?: { signStartDeadlineMs?: number },
): Promise<void> {
  await b.publishEvent(template, { ...publishOpts(options), ...extra });
}

function subscribeOpts(options?: VoiceTransportOptions) {
  return {
    watchdogMs: VOICE_SUB_WATCHDOG_MS,
    ...(options?.relayUrl
      ? {
          relays: [options.relayUrl],
          relayMode: 'replace' as const,
          affectsRelayAccess: false,
        }
      : {}),
  };
}

/**
 * Open a voice subscription that survives quota / rate-limit CLOSEs. The
 * bridge's watchdog already reissues on silence and on auth CLOSEs, but a
 * rate-limit CLOSE is final there, and a call cannot work without its
 * roster and signal feed.
 */
export function subscribeVoice(
  b: VoiceBridge,
  which: 'roster' | 'signals',
  filter: Parameters<typeof b.subscribeFilterWatched>[0],
  onEvent: Parameters<typeof b.subscribeFilterWatched>[1],
  options: VoiceTransportOptions,
): () => void {
  return resubscribeOnQuotaClose(
    ({ onQuotaOrRateLimitClose, alive }) => b.subscribeVoiceFilterWatched(
      filter,
      (ev) => { alive(); onEvent(ev); },
      { ...subscribeOpts(options), onQuotaOrRateLimitClose, onEose: () => alive('eose'), answerAuth: true },
    ),
    {
      onDegraded: (degraded) => {
        if (degraded) console.warn('[voice]', which, 'subscription rate-limited; reopening with backoff');
        pushVoiceDebug({ kind: 'relay-error', payload: { subscription: which, rateLimited: degraded } });
        options.onSubscriptionDegraded?.(which, degraded);
      },
    },
  );
}
