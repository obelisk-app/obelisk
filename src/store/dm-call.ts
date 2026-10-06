/**
 * The DM call state machine.
 *
 *   idle ─startCall─▶ outgoing ─accept─▶ connecting ─▶ active ⇄ reconnecting
 *     │                  │ decline/busy/timeout                    │
 *     │                  ▼                                         ▼
 *     └─invite─▶ incoming ─acceptCall─▶ connecting            ended ─▶ idle
 *                   │ decline/cancel/timeout/answered elsewhere
 *                   ▼
 *                 ended
 *
 * Control messages (invite / accept / decline / cancel / hangup / busy) are
 * gift-wrapped DMs (`bridge.sendDmCallMessage`); the media negotiation runs on
 * per-call throwaway keys (`DmCallSession`). Ringing goes through the same
 * notification stack as messages (`ringIncomingCall` - the user's ringtone,
 * the OS notification when backgrounded).
 *
 * Not persisted: a call does not survive a reload, and nothing about calls is
 * written to disk.
 *
 * This file is the entry point. The store and its actions live in
 * `dm-call-store.ts`, the policy helpers in `dm-call-policy.ts`, and the
 * shared runtime (session, timers) in `dm-call-runtime.ts`.
 *
 * Nothing here imports the media stack (`DmCallSession`, simple-peer): an
 * invite rings with only this module loaded, and the session is fetched on
 * demand (`services/dm-call/load-session.ts`).
 */

import { getBridge, getBridgeImpl } from '@/services/nostr-bridge';
import { ringIncomingCall } from '@/services/notifications/alert';
import { CALL_RING_TIMEOUT_MS, type IncomingDmCallMessage } from '@/services/dm-call/protocol';
import { prefetchDmCallSession } from '@/services/dm-call/load-session';
import { lost, mayRing, send, tr } from './dm-call-policy';
import { clearRinging, rt } from './dm-call-runtime';
import { EMPTY_MEDIA, finishCall, useDmCallStore } from './dm-call-store';

export { iceTransportPolicyFor, mayRing } from './dm-call-policy';
export { useDmCallStore, type DmCallEndReason, type DmCallStatus } from './dm-call-store';

/**
 * Route one control message. Exported for tests; `initDmCalls` wires it to
 * the bridge.
 */
export function handleDmCallMessage(msg: IncomingDmCallMessage & { peer: string }, me: string): void {
  const store = useDmCallStore.getState();
  const { status, callId, peer } = store;
  const fromMe = msg.from === me;

  if (msg.type === 'invite') {
    if (fromMe) return; // our own invite from another device - nothing to do
    if (!mayRing(msg.from)) return;
    if (callId === msg.callId) return; // duplicate delivery
    if (status !== 'idle' && status !== 'ended') {
      void send(msg.from, { type: 'busy', callId: msg.callId }).catch(lost('busy'));
      return;
    }
    if (rt.lingerTimer) clearTimeout(rt.lingerTimer);
    rt.pendingInvite = msg;
    useDmCallStore.setState({
      status: 'incoming', peer: msg.from, callId: msg.callId, video: msg.video === true,
      relays: msg.relays ?? [], endReason: null, error: null, connectedAt: null, media: EMPTY_MEDIA,
    });
    const title = getBridgeImpl()?.displayNameFor(msg.from) ?? 'Obelisk';
    // The name is in the title, as for a DM; the body never says more than
    // that a call is coming in.
    rt.stopRing = ringIncomingCall({ id: msg.callId, title, body: tr(msg.video ? 'call.incomingVideo' : 'call.incomingVoice') }).stop;
    // Ringing needs none of the media stack. Fetch it now, after the ring has
    // started, so it is in place by the time the user reaches "Accept".
    prefetchDmCallSession();
    rt.ringTimer = setTimeout(() => {
      if (useDmCallStore.getState().callId !== msg.callId || useDmCallStore.getState().status !== 'incoming') return;
      finishCall('missed');
    }, CALL_RING_TIMEOUT_MS);
    return;
  }

  if (msg.callId !== callId || msg.peer !== peer) return;

  switch (msg.type) {
    case 'accept':
      if (fromMe) {
        // We answered on another device.
        if (status === 'incoming') finishCall('answered-elsewhere');
        return;
      }
      if ((status !== 'outgoing' && status !== 'connecting') || !rt.session || !msg.eph) return;
      clearRinging();
      if (status === 'outgoing') useDmCallStore.setState({ status: 'connecting' });
      rt.session.peerAccepted(msg.eph);
      return;
    case 'decline':
      if (fromMe) {
        if (status === 'incoming') finishCall('answered-elsewhere');
        return;
      }
      if (status === 'outgoing') finishCall('declined');
      return;
    case 'busy':
      if (!fromMe && status === 'outgoing') finishCall('busy');
      return;
    case 'cancel':
      if (!fromMe && status === 'incoming') finishCall('missed');
      return;
    case 'hangup':
      if (!fromMe && (status === 'connecting' || status === 'active' || status === 'reconnecting' || status === 'outgoing')) {
        finishCall('remote-hangup');
      }
      return;
  }
}

let unsubscribe: (() => void) | null = null;

/**
 * Start listening for call control messages. Idempotent; mounted once per
 * shell by `DmCallLayer`. Ends any call in flight on logout/account switch.
 */
export async function initDmCalls(): Promise<() => void> {
  if (unsubscribe) return unsubscribe;
  const bridge = await getBridge();
  const off = bridge.subscribeDmCallMessages((msg) => {
    const me = bridge.getPublicKey();
    if (me) handleDmCallMessage(msg, me);
  });
  // Invites arrive on the DM inbox REQs. Both shells already keep a DM
  // consumer mounted for their unread badges, but a call must not depend on
  // that staying true. (Gated on the DM opt-in inside the bridge.)
  const offInbox = bridge.subscribeDirectMessages(() => {});
  unsubscribe = () => {
    off();
    offInbox();
    unsubscribe = null;
  };
  return unsubscribe;
}

/** Test seam. */
export function __resetDmCallsForTests(): void {
  clearRinging();
  if (rt.lingerTimer) clearTimeout(rt.lingerTimer);
  rt.lingerTimer = null;
  rt.session?.end('local-hangup');
  rt.session = null;
  rt.pendingInvite = null;
  unsubscribe?.();
  useDmCallStore.setState({
    status: 'idle', peer: null, callId: null, video: false, relayOnly: false, relays: [],
    media: EMPTY_MEDIA, connectedAt: null, endReason: null, error: null,
  });
}
