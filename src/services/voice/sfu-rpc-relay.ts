/**
 * The relay path to the SFU: subscribe to kind 25050 envelopes the SFU
 * addresses to us on this channel. `SfuRpc.start()` uses it when there is no
 * direct WebSocket, or the direct one failed.
 */
import { getBridge } from '@/services/nostr-bridge';
import { KIND_VOICE_SIGNAL } from '@/constants/nostr/nip-kinds';
import { sleep } from './sfu-rpc-support';
import { SFU_RPC_MAX_SUBSCRIBE_ATTEMPTS, SFU_RPC_WATCHDOG_MS, SUBSCRIBE_SETTLE_MS } from '@/constants/voice/sfu-rpc-support';

export interface RelayRpcHooks {
  channelId: string;
  sfuPubkey: string;
  selfPubkey: string;
  publishRelays: readonly string[];
  /** The unsubscribe for the inbound REQ, handed over as soon as it is open. */
  attach: (unsub: () => void) => void;
  /** A response or a notification from the SFU. */
  onInbound: (message: Record<string, unknown>) => void;
}

/** Opens the inbound subscription and resolves once it has had time to settle. */
export async function subscribeRelayRpc(hooks: RelayRpcHooks): Promise<void> {
  const b = await getBridge();
  const since = Math.floor(Date.now() / 1000) - 30;
  // Subscribe on the SFU's trusted relays in addition to the dex's
  // bridge defaults - the SFU only publishes responses where it itself
  // is connected (typically lacrypta-relay.obelisk.ar), and a dex tab opened on
  // public.obelisk.ar would otherwise time out every RPC. The bridge
  // merges with its own relay list so we don't drop events from
  // peers that publish to the default relays either.
  const watchOptions = hooks.publishRelays.length > 0
    ? {
        relays: hooks.publishRelays,
        watchdogMs: SFU_RPC_WATCHDOG_MS,
        maxAttempts: SFU_RPC_MAX_SUBSCRIBE_ATTEMPTS,
      }
    : {
        watchdogMs: SFU_RPC_WATCHDOG_MS,
        maxAttempts: SFU_RPC_MAX_SUBSCRIBE_ATTEMPTS,
      };
  hooks.attach(b.subscribeFilterWatched(
    {
      kinds: [KIND_VOICE_SIGNAL],
      '#e': [hooks.channelId],
      since,
    },
    (ev) => {
      // Only events FROM the SFU matter. Ignore mesh-style chatter from
      // other peers (mesh and SFU coexist on the same kind 25050).
      if (ev.pubkey !== hooks.sfuPubkey) return;
      const targets = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
      if (targets.length > 0 && !targets.includes(hooks.selfPubkey)) return;
      let parsed: unknown;
      try { parsed = JSON.parse(ev.content); } catch { return; }
      if (!parsed || typeof parsed !== 'object') return;
      // Responses and notifications only; requests from the SFU don't exist
      // in v1 (the server is response-only), and anything else is ignored.
      hooks.onInbound(parsed as Record<string, unknown>);
    },
    watchOptions,
  ));
  // The bridge does not expose relay subscription readiness. Give AUTH
  // gated relays one tick to attach before the first startup RPC goes out.
  await sleep(SUBSCRIBE_SETTLE_MS);
}
