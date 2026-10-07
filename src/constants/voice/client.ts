/**
 * Tunables for the mesh voice client: beacon cadence, room caps, deferred
 * signal bounds, SFU bootstrap timing, and the per-signer negotiation
 * budget. Each constant keeps the reasoning it was written with.
 */
export const SELF_BUILD_TAG = '2026-05-24T01:00:00Z-voice-video-autoplay-retry';

export const BEACON_INTERVAL_MS = 10_000;
export const REMOTE_SIGNER_BEACON_INTERVAL_MS = 30_000;
/**
 * Aggressive beacon burst right after `join()`. NIP-29 voice beacons are
 * ephemeral (relays don't backfill them), so a peer who joined a few
 * seconds before us would otherwise be invisible until their next 10 s
 * tick. Firing additional publishes in the first ~12 s collapses that
 * worst-case discovery latency to a few seconds while keeping the
 * total relay traffic bounded (six small events vs ~one event every
 * 15 s in steady state).
 *
 * Time origin = right after the first `publishBeacon()` returns from
 * `join()`. The schedule is intentionally front-loaded: each step is
 * roughly 2× the previous so a slow NIP-42 AUTH has multiple chances
 * to land a beacon before we settle into the steady-state cadence.
 */
export const BEACON_BRINGUP_DELAYS_MS = [300, 900, 1800, 3500, 7000, 12_000, 18_000];
/**
 * Mesh participant cap. Each peer maintains N-1 outbound audio streams
 * (so an N-person room is N(N-1) PCs total, quadratic). Four means
 * 12 directed streams room-wide, comfortable on a typical home upstream at
 * Opus 64-128 kbps per stream.
 *
 * **Active rejection**: when this cap is reached the existing peers
 * send a `bye { byeReason: 'room-full' }` to any over-cap arrival, so
 * the joiner stops repeated redial attempts immediately and surfaces a
 * clean error in their UI. Lex-deterministic ordering means every
 * existing peer agrees on who's "in" and who's "rejected" without
 * a coordinator. See `isWithinRoomCap`.
 */
export const MAX_PARTICIPANTS = 4;

export type VoiceSigner = 'nsec' | 'nip07' | 'bunker';

/**
 * Per-signer negotiation budget. A local key signs instantly, so trickle ICE
 * and the 9 s default are fine. An extension signs each event through a
 * serialized queue (and may prompt): with trickle on, offer + answer + every
 * candidate queued behind one another routinely overran 9 s and the peer
 * was torn down mid-negotiation. A bunker adds a relay round trip on top.
 */
export const SIGNER_PEER_BUDGET: Readonly<Record<VoiceSigner, { trickle: boolean; connectTimeoutMs?: number }>> = {
  nsec: { trickle: true },
  nip07: { trickle: false, connectTimeoutMs: 20_000 },
  bunker: { trickle: false, connectTimeoutMs: 45_000 },
};
/**
 * Independent room-wide media caps: four cameras and one screen share.
 * Beyond this, mesh uplink becomes
 * the binding constraint long before the audio mesh does. Race-overflow
 * resolution is deterministic via `(beaconCreatedAt asc, pubkey asc)`:
 * the holders outside the leading slice locally evict their video.
 */
export const MAX_CAMERAS = 4;
export const MAX_SCREEN_SHARES = 1;
/**
 * Debounce for opportunistic beacon refresh after a connection-state change.
 * Coalesces a flurry of `connected` transitions during initial mesh formation
 * into a single beacon publish so we don't spam the relay.
 */
export const BEACON_REFRESH_DEBOUNCE_MS = 250;
export const CONTROL_SNAPSHOT_DEBOUNCE_MS = 150;
/**
 * Window during which we hold an inbound signal from a peer who isn't yet
 * known to be a member. 5 s comfortably covers the expected race between
 * the peer's first kind 25050 and the bridge's kind 39002 snapshot
 * delivery on a healthy relay; longer windows just delay the failure
 * mode where the peer never appears at all.
 */
export const DEFERRED_SIGNAL_TTL_MS = 5_000;
/** Per-peer cap: offer + answer + ~6 ICE batches is the normal worst case. */
export const DEFERRED_SIGNAL_PER_PEER_CAP = 8;
/** Total cap across all unknown peers, to bound memory under a flood. */
export const DEFERRED_SIGNAL_TOTAL_CAP = 64;
/** How often the deferred queue self-sweeps for expired entries. */
export const DEFERRED_SIGNAL_SWEEP_MS = 1_000;
/**
 * Give the SFU's control subscription a short chance to process the
 * just-published `start` event before the first mediasoup RPC.
 */
export const SFU_START_SETTLE_MS = 350;
/**
 * Delays (ms) between successive SFU bootstrap attempts. Attempt 0 fires
 * immediately; subsequent attempts wait this long before reissuing
 * `publishSfuStart` + reopening RPC. Total wall-clock budget ≈ 6 s before
 * the user sees an error toast, comfortably covers the worst-case window
 * where the SFU process is still booting after a watchdog restart.
 */
export const SFU_BOOTSTRAP_ATTEMPT_DELAYS_MS = [0, 2_000, 4_000];
export const SFU_BOOTSTRAP_MAX_ATTEMPTS = SFU_BOOTSTRAP_ATTEMPT_DELAYS_MS.length;
/**
 * How long to wait after the SFU closes its room (kind 31314 status=closed)
 * before reconnecting. The VoiceRoom supervisor republishes `start` the
 * moment it sees `onTopologyChange(null)`; waiting one bootstrap step lets
 * the SFU reopen the room before our RPC lands, instead of racing it.
 */
export const SFU_REJOIN_DELAY_MS = 2_000;
