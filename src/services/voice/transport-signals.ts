/**
 * Directed signaling (kind 25050): publishing one payload to one peer, and
 * the subscription that receives what is addressed to us.
 */
import { KIND_VOICE_SIGNAL } from '@/utils/nostr/nip-kinds';
import type { VoiceSignalPayload } from './types';
import { pushVoiceDebug } from './debug';
import { bridge, publishViaBridge, subscribeVoice, type VoiceTransportOptions } from './transport-core';

const SEEN_SIGNAL_IDS_MAX = 2048;
/**
 * How long a signal may wait for a NIP-07 / NIP-46 signer before it is
 * dropped unsigned. An SDP or candidate that sat behind other signer work
 * this long belongs to a negotiation the peer has likely abandoned, and
 * signing it would only delay the fresh one queued after it.
 */
const SIGNAL_SIGN_START_DEADLINE_MS = 15_000;

/**
 * Publish a directed signaling event (offer / answer / ICE / bye /
 * trackinfo / qualityhint / requestReset) to a peer.
 */
export async function sendSignal(
  channelId: string,
  toPubkey: string,
  payload: VoiceSignalPayload,
  options: VoiceTransportOptions = {},
): Promise<void> {
  const b = await bridge();
  await publishViaBridge(
    b,
    {
      kind: KIND_VOICE_SIGNAL,
      content: JSON.stringify(payload),
      tags: [
        ['p', toPubkey],
        ['e', channelId],
        ['t', 'obelisk-voice-signal'],
      ],
    },
    options,
    // A `bye` is still worth delivering late; negotiation traffic is not.
    payload.type === 'bye' ? undefined : { signStartDeadlineMs: SIGNAL_SIGN_START_DEADLINE_MS },
  );
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
 * given channel. The REQ filters by `#p` (a kind-only filter counts against
 * a relay's unindexed-query budget and gets rate-limited closed), and the
 * handler still gates channel and recipient, for relays that ignore tag
 * filters on ephemeral kinds.
 */
export async function subscribeSignals(
  channelId: string,
  selfPubkey: string,
  onSignal: (fromPubkey: string, payload: VoiceSignalPayload) => void,
  options: VoiceTransportOptions = {},
): Promise<() => void> {
  const b = await bridge();
  const since = Math.floor(Date.now() / 1000) - 60;
  const seenIds = new Set<string>();

  function rememberSignalId(id: string | undefined): boolean {
    if (!id) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    if (seenIds.size > SEEN_SIGNAL_IDS_MAX) {
      const oldest = seenIds.values().next().value;
      if (oldest) seenIds.delete(oldest);
    }
    return true;
  }

  // Watched variant: same reasoning as `subscribeRoster`. Without auto-
  // retry, a relay disconnect mid-call means SDP offers / answers / ICE
  // candidates from new joiners never reach us; the call stays formed for
  // existing peers but a third joiner appears to "not be detected".
  return subscribeVoice(
    b,
    'signals',
    {
      kinds: [KIND_VOICE_SIGNAL],
      '#p': [selfPubkey],
      since,
    },
    (ev) => {
      if (!rememberSignalId(ev.id)) {
        pushVoiceDebug({ kind: 'signal-dropped', reason: 'duplicate', peer: ev.pubkey });
        return;
      }
      if (ev.pubkey === selfPubkey) {
        pushVoiceDebug({ kind: 'signal-dropped', reason: 'self' });
        return;
      }
      if (!ev.tags.some((t) => t[0] === 'e' && t[1] === channelId)) {
        pushVoiceDebug({ kind: 'signal-dropped', reason: 'wrong-channel', peer: ev.pubkey });
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
    options,
  );
}
