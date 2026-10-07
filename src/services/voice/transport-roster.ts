/**
 * The roster subscription: every live presence beacon in a channel, parsed
 * into `VoicePresence` and swept as beacons expire.
 */
import { KIND_VOICE_PRESENCE } from '@/constants/nostr/nip-kinds';
import type { VoicePresence, VideoSlotKind } from './types';
import { pushVoiceDebug } from './debug';
import { bridge, subscribeVoice, type VoiceTransportOptions } from './transport-core';
import { PRESENCE_TTL_SECONDS } from '@/constants/voice/transport-core';

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
  options: VoiceTransportOptions = {},
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
  // `subscribeFilter` runs once and dies silently. Symptom: one browser
  // logs "WebSocket is already in CLOSING or CLOSED state" while another
  // never sees a new joiner because its sub went dead. The watchdog detects
  // the silence (5 s no EVENT/EOSE) and re-issues the REQ with backoff.
  //
  // `#e` keeps the filter indexed. A kind-only REQ reads as a scrape to a
  // relay's unindexed-query budget, and the watchdog's reissues burned
  // through it until the relay started refusing the roster outright.
  const unsub = subscribeVoice(
    b,
    'roster',
    {
      kinds: [KIND_VOICE_PRESENCE],
      '#e': [channelId],
    },
    (ev) => {
      // Still checked: a relay may ignore tag filters on ephemeral kinds.
      if (!ev.tags.some((t) => t[0] === 'e' && t[1] === channelId)) return;
      const expirationTag = ev.tags.find((t) => t[0] === 'expiration')?.[1];
      const expiresAt = expirationTag
        ? parseInt(expirationTag, 10)
        : ev.created_at + PRESENCE_TTL_SECONDS;
      if (!Number.isFinite(expiresAt)) return;
      // Bump the receive counter even for staler beacons; it measures
      // raw delivery, not de-duplicated deliveries.
      const w = (typeof window !== 'undefined' ? window : globalThis) as unknown as {
        __obeliskVoiceMetrics?: { beacons: { rcvd: number } };
      };
      if (w.__obeliskVoiceMetrics) w.__obeliskVoiceMetrics.beacons.rcvd++;
      pushVoiceDebug({ kind: 'beacon-rcvd', peer: ev.pubkey });
      const status = ev.tags.find((t) => t[0] === 'status')?.[1];
      const terminal = status === 'left' || status === 'closed' || expiresAt <= Math.floor(Date.now() / 1000);
      const prev = latest.get(ev.pubkey);
      if (prev && (prev.createdAt > ev.created_at || (prev.createdAt === ev.created_at && !terminal))) return;
      const connectedTo = ev.tags
        .filter((t) => t[0] === 'p' && typeof t[1] === 'string' && t[1].length > 0)
        .map((t) => t[1])
        // Drop self-references defensively: a beacon claiming it's
        // connected to itself is meaningless and would inflate the roster.
        .filter((pk) => pk !== ev.pubkey);
      const knownPeerSet = new Set<string>();
      for (const t of ev.tags) {
        if (t[0] !== 'peer') continue;
        if (typeof t[1] !== 'string' || t[1].length === 0) continue;
        if (t[1] === ev.pubkey) continue;
        knownPeerSet.add(t[1]);
      }
      // Back-compat: old beacons only published connected peers as `p` tags.
      for (const pk of connectedTo) knownPeerSet.add(pk);
      const knownPeers = Array.from(knownPeerSet);
      const videoTracks = ev.tags
        .filter((t) => t[0] === 'v' && (t[1] === 'camera' || t[1] === 'screen'))
        .map((t) => t[1] as VideoSlotKind);
      // SFU advertisements carry `["sfu","1"]` on every beacon; mesh peers
      // never set it. The VoiceClient uses it only to admit that pubkey as
      // a pseudo-member of the mesh (`knownSfuPubkeys`) and to force the
      // polite role when dialing it; the topology itself is decided by
      // `pickSfu`, never by this tag.
      const isSfu = ev.tags.some((t) => t[0] === 'sfu' && t[1] === '1');
      const isMeshTestPeer = ev.tags.some((t) =>
        (t[0] === 'client' && t[1] === 'obelisk-mesh-test-peer') ||
        (t[0] === 'test-peer' && t[1] === 'mesh'),
      );
      latest.set(ev.pubkey, {
        pubkey: ev.pubkey,
        channelId,
        createdAt: ev.created_at,
        expiresAt,
        connectedTo,
        knownPeers,
        videoTracks,
        isSfu,
        isMeshTestPeer,
      });
      emit();
    },
    options,
  );

  emit();

  return () => {
    (typeof window !== 'undefined' ? window : globalThis as unknown as { clearInterval: typeof clearInterval })
      .clearInterval(sweep);
    unsub();
  };
}
