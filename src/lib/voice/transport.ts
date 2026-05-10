/**
 * Thin Nostr transport for voice channels: presence beacons + per-peer
 * signaling. Sits on top of the existing nostr-bridge so we share the relay
 * pool, signing, and NIP-42 auth retry path.
 *
 * Beacons (kind 20078) optionally announce the publisher's currently-
 * connected peers as `p` tags. That feeds transitive discovery in the
 * VoiceClient: a fresh joiner whose relay drops some publishers' beacons
 * still learns about those peers via the `p`-tag list of any beacon they
 * do receive — so mesh formation converges from any starting position.
 *
 * Signaling (kind 25050) carries SDP / ICE / track-info / quality hints /
 * polite-side `requestReset` payloads.
 *
 * v1 publishes signed plaintext ephemeral events. We can swap to gift-wrap
 * later without changing the transport surface.
 */
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge/client';
import {
  KIND_VOICE_PRESENCE,
  KIND_VOICE_SIGNAL,
} from '@/lib/nip-kinds';
import type { VoicePresence, VoiceSignalPayload, VideoSlotKind } from './types';
import { pushVoiceDebug } from './debug';

const PRESENCE_TTL_SECONDS = 30;

async function bridge() {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('nostr bridge not initialized');
  return impl;
}

/**
 * Publish a presence beacon for the given channel.
 *
 * @param channelId - NIP-29 group id this beacon advertises presence in.
 * @param connectedTo - Peer pubkeys the publisher currently has live
 *   RTCPeerConnections to. Emitted as `p` tags so other participants can
 *   discover them transitively when their relay drops the publisher's
 *   own beacon. Empty / omitted = "no successful connections yet"
 *   (cold-started client).
 * @param videoTracks - Outbound video tracks the publisher is currently
 *   sending (any of `camera`, `screen`). Emitted as `v` tags so every
 *   participant can compute the room-wide video count and enforce the
 *   `MAX_VIDEO_SLOTS` cap (see `client.ts`). Empty for audio-only joiners.
 *
 * Caller is responsible for the cadence (every ~15s while in the channel)
 * and for opportunistic re-publishes when `connectedTo` or `videoTracks`
 * changes.
 */
export async function publishPresenceBeacon(
  channelId: string,
  connectedTo: readonly string[] = [],
  videoTracks: readonly VideoSlotKind[] = [],
): Promise<void> {
  const b = await bridge();
  const expiration = Math.floor(Date.now() / 1000) + PRESENCE_TTL_SECONDS;
  const tags: string[][] = [
    ['e', channelId],
    ['t', 'obelisk-voice-presence'],
    ['expiration', String(expiration)],
  ];
  // Dedup so a flapping connection-state-change doesn't spam tags.
  const seenP = new Set<string>();
  for (const pk of connectedTo) {
    if (!pk || seenP.has(pk)) continue;
    seenP.add(pk);
    tags.push(['p', pk]);
  }
  const seenV = new Set<string>();
  for (const kind of videoTracks) {
    if (kind !== 'camera' && kind !== 'screen') continue;
    if (seenV.has(kind)) continue;
    seenV.add(kind);
    tags.push(['v', kind]);
  }
  await b.publishEvent({
    kind: KIND_VOICE_PRESENCE,
    content: '',
    tags,
  });
  console.log(
    '[voice] beacon published for', channelId.slice(0, 8),
    '+', connectedTo.length, 'connections',
    videoTracks.length > 0 ? `+ video=[${videoTracks.join(',')}]` : '',
  );
}

/**
 * Subscribe to presence beacons for a channel.
 *
 * Calls `onChange` with the live roster (publishers with non-expired beacons,
 * each carrying their own `connectedTo` list) whenever the set updates. The
 * caller (`VoiceClient`) is responsible for computing the transitive
 * participant union from publishers + their connectedTo lists, since that
 * computation also needs to be combined with the local connection state.
 */
export async function subscribeRoster(
  channelId: string,
  onChange: (roster: VoicePresence[]) => void,
): Promise<() => void> {
  const b = await bridge();
  const latest = new Map<string, VoicePresence>();

  function emit() {
    const now = Math.floor(Date.now() / 1000);
    const live = Array.from(latest.values()).filter((p) => p.expiresAt > now);
    onChange(live);
  }

  // Sweep stale entries roughly twice per TTL so leavers disappear from the
  // roster even if no new beacons arrive.
  const sweep = (typeof window !== 'undefined' ? window : globalThis as unknown as { setInterval: typeof setInterval })
    .setInterval(emit, (PRESENCE_TTL_SECONDS / 2) * 1000);

  // Use the WATCHED variant so the subscription auto-recovers when a relay's
  // WebSocket drops (network blip, server restart, NAT rebind). The raw
  // `subscribeFilter` runs once and dies silently — symptom: one browser
  // logs "WebSocket is already in CLOSING or CLOSED state" while another
  // never sees a new joiner because its sub went dead. The watchdog detects
  // the silence (5 s no EVENT/EOSE) and re-issues the REQ with backoff.
  const unsub = b.subscribeFilterWatched(
    {
      kinds: [KIND_VOICE_PRESENCE],
      '#e': [channelId],
    },
    (ev) => {
      const expirationTag = ev.tags.find((t) => t[0] === 'expiration')?.[1];
      const expiresAt = expirationTag
        ? parseInt(expirationTag, 10)
        : ev.created_at + PRESENCE_TTL_SECONDS;
      if (!Number.isFinite(expiresAt)) return;
      // Bump the receive counter even for staler beacons — it measures
      // raw delivery, not de-duplicated deliveries.
      const w = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
        __obeliskVoiceMetrics?: { beacons: { rcvd: number } };
      };
      if (w.__obeliskVoiceMetrics) w.__obeliskVoiceMetrics.beacons.rcvd++;
      pushVoiceDebug({ kind: 'beacon-rcvd', peer: ev.pubkey });
      const prev = latest.get(ev.pubkey);
      if (prev && prev.createdAt >= ev.created_at) return;
      const connectedTo = ev.tags
        .filter((t) => t[0] === 'p' && typeof t[1] === 'string' && t[1].length > 0)
        .map((t) => t[1])
        // Drop self-references defensively — a beacon claiming it's
        // connected to itself is meaningless and would inflate the roster.
        .filter((pk) => pk !== ev.pubkey);
      const videoTracks = ev.tags
        .filter((t) => t[0] === 'v' && (t[1] === 'camera' || t[1] === 'screen'))
        .map((t) => t[1] as VideoSlotKind);
      // SFU advertisements carry `["sfu","1"]` on every beacon; mesh peers
      // never set it. The presence/absence is the topology marker the
      // VoiceClient uses to switch dial behavior — see `setSfuMode`.
      const isSfu = ev.tags.some((t) => t[0] === 'sfu' && t[1] === '1');
      latest.set(ev.pubkey, {
        pubkey: ev.pubkey,
        channelId,
        createdAt: ev.created_at,
        expiresAt,
        connectedTo,
        videoTracks,
        isSfu,
      });
      emit();
    },
  );

  emit();

  return () => {
    (typeof window !== 'undefined' ? window : globalThis as unknown as { clearInterval: typeof clearInterval })
      .clearInterval(sweep);
    unsub();
  };
}

/**
 * Publish a directed signaling event (offer / answer / ICE / bye /
 * trackinfo / qualityhint / requestReset) to a peer.
 */
export async function sendSignal(
  channelId: string,
  toPubkey: string,
  payload: VoiceSignalPayload,
): Promise<void> {
  const b = await bridge();
  await b.publishEvent({
    kind: KIND_VOICE_SIGNAL,
    content: JSON.stringify(payload),
    tags: [
      ['p', toPubkey],
      ['e', channelId],
      ['t', 'obelisk-voice-signal'],
    ],
  });
  console.log('[voice] →', payload.type, 'to', toPubkey.slice(0, 8), 'seq', payload.seq);
  pushVoiceDebug({ kind: 'signal-sent', peer: toPubkey, payload: { type: payload.type, seq: payload.seq } });
  // Also bump the global metrics counter (mirrored to window.__obeliskVoiceMetrics)
  // so the Playwright spec doesn't have to walk the debug ring buffer for sends.
  const w = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
    __obeliskVoiceMetrics?: { signals: { sent: number } };
  };
  if (w.__obeliskVoiceMetrics) w.__obeliskVoiceMetrics.signals.sent++;
}

/**
 * Subscribe to incoming signaling events addressed to the local user in the
 * given channel. Some relays don't index `#p` for ephemeral kinds so we
 * subscribe by `#e` (channel) only and gate by p-tag in the handler.
 */
export async function subscribeSignals(
  channelId: string,
  selfPubkey: string,
  onSignal: (fromPubkey: string, payload: VoiceSignalPayload) => void,
): Promise<() => void> {
  const b = await bridge();
  const since = Math.floor(Date.now() / 1000) - 60;
  // Watched variant — same reasoning as `subscribeRoster`. Without auto-
  // retry, a relay disconnect mid-call means SDP offers / answers / ICE
  // candidates from new joiners never reach us; the call stays formed for
  // existing peers but a third joiner appears to "not be detected".
  return b.subscribeFilterWatched(
    {
      kinds: [KIND_VOICE_SIGNAL],
      '#e': [channelId],
      since,
    },
    (ev) => {
      if (ev.pubkey === selfPubkey) {
        pushVoiceDebug({ kind: 'signal-dropped', reason: 'self' });
        return;
      }
      const targets = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
      if (targets.length > 0 && !targets.includes(selfPubkey)) {
        pushVoiceDebug({ kind: 'signal-dropped', reason: 'not-for-me', peer: ev.pubkey });
        return;
      }
      try {
        const payload = JSON.parse(ev.content) as VoiceSignalPayload;
        console.log('[voice] ←', payload.type, 'from', ev.pubkey.slice(0, 8), 'seq', payload.seq);
        pushVoiceDebug({ kind: 'signal-rcvd', peer: ev.pubkey, payload: { type: payload.type, seq: payload.seq } });
        onSignal(ev.pubkey, payload);
      } catch (e) {
        console.warn('[voice] malformed signal', e);
      }
    },
  );
}

export function getSelfPubkey(): string | null {
  return getBridgeImpl()?.getPublicKey() ?? null;
}

/**
 * Compute the transitive participant set from a beacon roster.
 *
 * The relay only tells us about publishers we directly received beacons
 * from. To survive dropped beacons, each beacon also lists who its
 * publisher has confirmed live connections with — `connectedTo`. Union
 * those into the publisher set and you get every pubkey known to be in
 * the room.
 *
 * Self is included as a transitive hint when other peers list us — but
 * `VoiceClient` always filters `selfPubkey` out before opening peers, so
 * we don't dial ourselves.
 */
export function transitiveParticipants(
  roster: readonly VoicePresence[],
): string[] {
  const set = new Set<string>();
  for (const p of roster) {
    set.add(p.pubkey);
    for (const pk of p.connectedTo) set.add(pk);
  }
  return Array.from(set);
}
