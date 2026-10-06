/**
 * Standing up the SFU client for `SfuSession.enter`: resolve the control and
 * RPC relays, then the bootstrap ladder (publish `start` when there is no
 * direct URL, retry a cold-start RPC timeout, treat anything else as
 * permanent), and the failure path that keeps `voice-sfu` channels on the
 * SFU instead of falling back to mesh. Every await re-checks `isJoined`, so
 * a leave() mid-bootstrap never leaves a client nobody owns.
 */
import { SfuClient } from './sfu-client';
import { pickSfu, publishSfuStart, type SfuAdvertisement } from './sfu-control';
import { sfuRoomEvents } from './sfu-room-events';
import type { SfuSessionDeps } from './sfu-session';
import {
  SFU_START_SETTLE_MS,
  SFU_BOOTSTRAP_ATTEMPT_DELAYS_MS,
  SFU_BOOTSTRAP_MAX_ATTEMPTS,
} from './constants';

/** The two `SfuSession` fields the bootstrap sets and clears. */
export interface SfuBootstrapTarget {
  pubkey: string | null;
  client: SfuClient | null;
}

async function publishSfuStartOrThrow(channelId: string, sfuPubkey: string, controlRelays: readonly string[]): Promise<void> {
  const ok = await publishSfuStart(channelId, sfuPubkey, {
    trustedRelays: controlRelays,
    params: { video: true, screen: true, maxParticipants: 50 },
    force: true,
  });
  if (!ok) throw new Error('Could not publish SFU start control event.');
  await new Promise((resolve) => setTimeout(resolve, SFU_START_SETTLE_MS));
}

function isInitialSfuRpcTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.includes('rpc timeout: getRouterRtpCapabilities');
}

async function failSfuStart(target: SfuBootstrapTarget, deps: SfuSessionDeps, client: SfuClient, sfuPubkey: string, err: unknown): Promise<never> {
  console.warn('[voice] SfuClient.start failed', err);
  // start() failed - no live RPC subscription to gracefully close.
  // Use 0-budget close (skip the bounded await for the leave RPC),
  // since the SFU may not have registered a peer for us.
  try { await client.close(0); } catch { /* 0-budget close of a client whose start() failed */ }
  if (target.client === client) target.client = null;
  if (target.pubkey === sfuPubkey) {
    target.pubkey = null;
    try { deps.room.events.onTopologyChange?.(null); } catch (err) {
      console.warn('[voice] onTopologyChange handler threw', err);
    }
  }
  // SFU-pinned channels stay on SFU. Surface a clear error and stop  - 
  // mesh fallback would silently change the call's semantics (peer cap,
  // forwarding, recording capability) and the channel admin's pin is
  // an explicit choice we shouldn't override on a transient outage.
  const msg = err instanceof Error ? err.message : String(err);
  try { deps.room.events.onError?.(`Could not connect to the SFU: ${msg}`); } catch (err) {
    console.warn('[voice] onError handler threw', err);
  }
  throw err;
}

/**
 * Stand up the mediasoup-client driver: open RPC, load Device, build
 * send/recv transports, then push every local track.
 */
export async function startSfuClient(
  target: SfuBootstrapTarget,
  deps: SfuSessionDeps,
  sfuPubkey: string,
  resolvedSfu?: SfuAdvertisement,
): Promise<void> {
  // Keep control and RPC relay roles separate. `trusted_relay` is the
  // authorization lane for kind 25052 start events; the SFU publishes
  // kind 25050 RPC responses on its writable/general `relay` set. Using
  // trusted-only relays for RPC makes browsers wait through rejected or
  // closed relays before landing on the relay where the SFU answered.
  //
  // Resolution order matches `pickSfu(channelId)`:
  //   1. per-channel pin (kind 30078)        - preferred
  //   2. NEXT_PUBLIC_SFU_TRUSTED_RELAYS env  - fallback for unconfigured channels
  const picked = resolvedSfu?.pubkey === sfuPubkey
    ? resolvedSfu
    : await pickSfu(deps.channelId);
  let controlRelays: string[] = [];
  let rpcRelays: string[] = [];
  if (picked && picked.pubkey === sfuPubkey) {
    controlRelays = picked.trustedRelays.length > 0
      ? [...picked.trustedRelays]
      : [...picked.generalRelays];
    rpcRelays = picked.generalRelays.length > 0
      ? [...picked.generalRelays]
      : [...picked.trustedRelays];
  } else {
    const envControlRelays = (process.env.NEXT_PUBLIC_SFU_TRUSTED_RELAYS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const envRpcRelays = (process.env.NEXT_PUBLIC_SFU_RELAYS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    controlRelays = envControlRelays;
    rpcRelays = envRpcRelays.length > 0 ? envRpcRelays : envControlRelays;
  }
  const makeClient = (): SfuClient => new SfuClient({
    channelId: deps.channelId,
    sfuPubkey,
    ...(picked?.url ? {
      sfuUrl: picked.url,
      onRelayFallback: () => publishSfuStartOrThrow(deps.channelId, sfuPubkey, controlRelays),
    } : {}),
    selfPubkey: deps.selfPubkey,
    ...(rpcRelays.length > 0 ? { trustedRelays: rpcRelays } : {}),
    events: sfuRoomEvents(deps.room, deps.metrics, sfuPubkey),
  });

  // Bootstrap loop. Direct RPC authenticates and opens the room itself.
  // Older SFUs fall back to the Nostr start + kind 25050 path; that path can
  // race room creation with its first RPC. The next-most-common failure is
  // "SFU process is restarting after a watchdog auto-heal." Both are
  // recoverable by reissuing `start` (force=true, already inside
  // publishSfuStartOrThrow) with a fresh RPC client. Any non-timeout
  // failure is treated as permanent - those are typically auth, network,
  // or allow-list rejections, which retrying just lengthens the time
  // before the user sees the error.
  let client: SfuClient | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < SFU_BOOTSTRAP_MAX_ATTEMPTS; attempt++) {
    const delay = SFU_BOOTSTRAP_ATTEMPT_DELAYS_MS[attempt] ?? 0;
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    // leave() during the retry delay: the previous attempt is already
    // closed, and building another client here would leave an RPC
    // subscription and two transports open on a client nobody owns.
    if (!deps.isJoined()) return;
    client = makeClient();
    target.client = client;
    try {
      if (!picked?.url) await publishSfuStartOrThrow(deps.channelId, sfuPubkey, controlRelays);
      if (!deps.isJoined()) {
        await client.close(0);
        if (target.client === client) target.client = null;
        return;
      }
      await client.start();
      if (!deps.isJoined()) {
        await client.close(0);
        if (target.client === client) target.client = null;
        return;
      }
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (!isInitialSfuRpcTimeout(err)) {
        return failSfuStart(target, deps, client, sfuPubkey, err);
      }
      const next = attempt + 1;
      console.warn(`[voice] SFU bootstrap attempt ${next}/${SFU_BOOTSTRAP_MAX_ATTEMPTS} timed out, retrying`);
      try { await client.close(0); } catch { /* closing the timed-out attempt */ }
      if (target.client === client) target.client = null;
      // Leave `client` pointing at the (now-closed) instance so the
      // post-loop failSfuStart on exhaustion has a real reference to
      // pass - recreating one just for the signature wastes resources
      // (and would surface a phantom Nth SfuClient instance in tests).
    }
  }
  if (lastErr) {
    // All attempts exhausted on the cold-start race. Surface as the
    // standard SFU-start failure so the UI's error toast + pinned-SFU
    // guarantees behave the same as a single-attempt failure used to.
    if (!client) {
      // Defensive: the loop must have run at least one attempt before
      // recording lastErr, so client should always be set.
      throw new Error('SFU bootstrap failed with no client reference');
    }
    return failSfuStart(target, deps, client, sfuPubkey, lastErr);
  }
  if (!client) {
    // Defensive: the loop should always set `client` on success. Treat
    // an unset client as a logic bug rather than silently producing a
    // half-built state.
    throw new Error('SFU bootstrap loop exited without a client');
  }
  await deps.localMedia.publishAllTo(client);
}
