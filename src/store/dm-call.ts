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
 * notification stack as messages (`ringIncomingCall` — the user's ringtone,
 * the OS notification when backgrounded).
 *
 * Not persisted: a call does not survive a reload, and nothing about calls is
 * written to disk.
 */

import { create } from 'zustand';
import { generateSecretKey } from 'nostr-tools';
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge/client';
import { getPreferences } from '@/lib/preferences';
import { useModerationStore } from '@/store/moderation';
import { useVoiceStore } from '@/store/voice';
import { getActiveVoiceClient, setActiveVoiceClient } from '@/lib/voice/active-client';
import { HAS_TURN } from '@/lib/voice/ice-config';
import { ringIncomingCall, startRingback } from '@/lib/notifications/alert';
import { CALL_RING_TIMEOUT_MS, newCallId, type DmCallMessage, type IncomingDmCallMessage } from '@/lib/dm-call/protocol';
import { DmCallSession, type DmCallMediaState, type DmCallPhase } from '@/lib/dm-call/session';
import { getTranslation, isLocale } from '@/i18n';

function tr(key: string): string {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : '';
  return getTranslation(isLocale(lang) ? lang : 'en')(key);
}

export type DmCallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'reconnecting' | 'ended';

export type DmCallEndReason =
  | 'local-hangup' | 'remote-hangup' | 'declined' | 'busy' | 'no-answer' | 'missed'
  | 'cancelled' | 'answered-elsewhere' | 'connect-failed' | 'connection-lost' | 'error';

const EMPTY_MEDIA: DmCallMediaState = {
  micOn: true,
  cameraOn: false,
  screenOn: false,
  localVideo: null,
  localScreen: null,
  remoteAudio: null,
  remoteVideo: null,
  remoteScreen: null,
};

/** How long the "call ended" card lingers before the overlay closes. */
const ENDED_LINGER_MS = 2500;

interface DmCallState {
  status: DmCallStatus;
  peer: string | null;
  callId: string | null;
  /** The call started as a video call. */
  video: boolean;
  /** Traffic is forced through TURN (the other side can't see our IP). */
  relayOnly: boolean;
  relays: readonly string[];
  media: DmCallMediaState;
  /** ms epoch the media connected — for the call timer. */
  connectedAt: number | null;
  endReason: DmCallEndReason | null;
  error: string | null;

  startCall: (peer: string, video: boolean) => Promise<void>;
  acceptCall: (video: boolean) => Promise<void>;
  declineCall: () => void;
  hangup: () => void;
  setMic: (on: boolean) => void;
  setCamera: (on: boolean) => Promise<void>;
  flipCamera: () => Promise<void>;
  setScreenShare: (on: boolean) => Promise<void>;
  dismiss: () => void;
}

// Module-private runtime — not state anyone renders.
let session: DmCallSession | null = null;
let pendingInvite: IncomingDmCallMessage | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let lingerTimer: ReturnType<typeof setTimeout> | null = null;
let stopRing: (() => void) | null = null;

function clearRinging(): void {
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
  stopRing?.();
  stopRing = null;
}

function send(peer: string, msg: DmCallMessage, selfNotice = false): Promise<void> {
  return getBridge().then((b) => b.sendDmCallMessage(peer, msg, { selfNotice }));
}

function isContact(pubkey: string): boolean {
  const list = getBridgeImpl()?.myContactList.get();
  return Boolean(list?.tags.some((t) => t[0] === 'p' && t[1] === pubkey));
}

/** Resolve the ICE policy for a call with `peer` — see `CallIpProtection`. */
export function iceTransportPolicyFor(peer: string): RTCIceTransportPolicy {
  const mode = getPreferences().callIpProtection;
  if (mode === 'always') return 'relay';
  if (mode === 'never') return 'all';
  return !isContact(peer) && HAS_TURN ? 'relay' : 'all';
}

/** Whether `from` may ring us at all. */
export function mayRing(from: string): boolean {
  const mod = useModerationStore.getState();
  if (mod.isBlocked(from) || mod.isMuted(from)) return false;
  return getPreferences().callsFrom === 'anyone' || isContact(from);
}

/** A group voice call holds the mic; leave it before a DM call takes over. */
async function leaveGroupVoice(): Promise<void> {
  const c = getActiveVoiceClient();
  if (!c) return;
  try { await c.leave(); } catch { /* swallow */ }
  setActiveVoiceClient(null);
  useVoiceStore.getState().leaveVoice();
}

export const useDmCallStore = create<DmCallState>((set, get) => {
  function makeSession(role: 'caller' | 'callee', callId: string, relays: readonly string[], video: boolean, peer: string): DmCallSession {
    const relayOnly = iceTransportPolicyFor(peer) === 'relay';
    set({ relayOnly });
    const s = new DmCallSession({
      role,
      callId,
      selfSk: generateSecretKey(),
      relays,
      video,
      iceTransportPolicy: relayOnly ? 'relay' : 'all',
      onMedia: (media) => { if (session === s) set({ media }); },
      onPhase: (phase: DmCallPhase, reason?: string) => {
        if (session !== s) return;
        if (phase === 'connected') {
          set({ status: 'active', connectedAt: get().connectedAt ?? Date.now() });
        } else if (phase === 'reconnecting') {
          set({ status: 'reconnecting' });
        } else if (phase === 'ended') {
          const known: DmCallEndReason[] = ['local-hangup', 'remote-hangup', 'connect-failed', 'connection-lost'];
          const r = (known as string[]).includes(reason ?? '') ? reason as DmCallEndReason : 'error';
          // Tell the other side over the gift-wrap path too; its relay may be
          // the one that failed.
          if (r === 'connect-failed' || r === 'connection-lost') void send(peer, { type: 'hangup', callId }).catch(() => {});
          finishCall(r);
        }
      },
    });
    return s;
  }

  return {
    status: 'idle',
    peer: null,
    callId: null,
    video: false,
    relayOnly: false,
    relays: [],
    media: EMPTY_MEDIA,
    connectedAt: null,
    endReason: null,
    error: null,

    async startCall(peer, video) {
      const st = get().status;
      if (st !== 'idle' && st !== 'ended') return;
      if (lingerTimer) clearTimeout(lingerTimer);
      await leaveGroupVoice();
      const callId = newCallId();
      const relays = getPreferences().callRelays;
      const s = makeSession('caller', callId, relays, video, peer);
      session = s;
      set({ status: 'outgoing', peer, callId, video, relays, endReason: null, error: null, connectedAt: null });
      try {
        await s.acquireMedia();
      } catch (e) {
        set({ error: (e as Error).message || 'microphone unavailable' });
        finishCall('error');
        return;
      }
      if (session !== s) return;
      stopRing = startRingback().stop;
      ringTimer = setTimeout(() => {
        if (session !== s || get().status !== 'outgoing') return;
        void send(peer, { type: 'cancel', callId }).catch(() => {});
        finishCall('no-answer');
      }, CALL_RING_TIMEOUT_MS);
      try {
        await send(peer, { type: 'invite', callId, eph: s.selfEph, relays, video });
      } catch (e) {
        set({ error: (e as Error).message || 'could not send the call' });
        finishCall('error');
      }
    },

    async acceptCall(video) {
      const invite = pendingInvite;
      if (!invite || get().status !== 'incoming' || !invite.eph || !invite.relays) return;
      clearRinging();
      await leaveGroupVoice();
      const s = makeSession('callee', invite.callId, invite.relays, video, invite.from);
      session = s;
      set({ status: 'connecting', video });
      try {
        await s.acquireMedia();
      } catch (e) {
        set({ error: (e as Error).message || 'microphone unavailable' });
        void send(invite.from, { type: 'decline', callId: invite.callId }, true).catch(() => {});
        finishCall('error');
        return;
      }
      if (session !== s) return;
      // Subscribe before accepting, so the caller's first offer has somewhere to land.
      s.openSignaling(invite.eph);
      s.connect();
      try {
        await send(invite.from, { type: 'accept', callId: invite.callId, eph: s.selfEph }, true);
      } catch (e) {
        set({ error: (e as Error).message || 'could not answer' });
        finishCall('error');
      }
    },

    declineCall() {
      const invite = pendingInvite;
      if (!invite || get().status !== 'incoming') return;
      void send(invite.from, { type: 'decline', callId: invite.callId }, true).catch(() => {});
      finishCall('declined');
    },

    hangup() {
      const { status, peer, callId } = get();
      if (!peer || !callId) return;
      if (status === 'incoming') { get().declineCall(); return; }
      if (status === 'outgoing') {
        void send(peer, { type: 'cancel', callId }).catch(() => {});
        finishCall('cancelled');
        return;
      }
      if (status === 'connecting' || status === 'active' || status === 'reconnecting') {
        // Bye over the call relay (fast) and over the gift-wrap path (sure).
        session?.hangup();
        void send(peer, { type: 'hangup', callId }).catch(() => {});
        finishCall('local-hangup');
      }
    },

    setMic(on) { session?.setMic(on); },
    async setCamera(on) {
      try { await session?.setCamera(on); } catch (e) { set({ error: (e as Error).message }); }
    },
    async flipCamera() {
      try { await session?.flipCamera(); } catch (e) { set({ error: (e as Error).message }); }
    },
    async setScreenShare(on) {
      try { await session?.setScreenShare(on); } catch (e) {
        // Cancelling the browser's picker is not an error worth showing.
        if ((e as Error).name !== 'NotAllowedError') set({ error: (e as Error).message });
      }
    },

    dismiss() {
      if (lingerTimer) clearTimeout(lingerTimer);
      lingerTimer = null;
      if (get().status !== 'ended' && get().status !== 'idle') return;
      set({ status: 'idle', peer: null, callId: null, video: false, relayOnly: false, relays: [], media: EMPTY_MEDIA, endReason: null, error: null, connectedAt: null });
    },
  };
});

/**
 * Route one control message. Exported for tests; `initDmCalls` wires it to
 * the bridge.
 */
export function handleDmCallMessage(msg: IncomingDmCallMessage & { peer: string }, me: string): void {
  const store = useDmCallStore.getState();
  const { status, callId, peer } = store;
  const fromMe = msg.from === me;

  if (msg.type === 'invite') {
    if (fromMe) return; // our own invite from another device — nothing to do
    if (!mayRing(msg.from)) return;
    if (callId === msg.callId) return; // duplicate delivery
    if (status !== 'idle' && status !== 'ended') {
      void send(msg.from, { type: 'busy', callId: msg.callId }).catch(() => {});
      return;
    }
    if (lingerTimer) clearTimeout(lingerTimer);
    pendingInvite = msg;
    useDmCallStore.setState({
      status: 'incoming', peer: msg.from, callId: msg.callId, video: msg.video === true,
      relays: msg.relays ?? [], endReason: null, error: null, connectedAt: null, media: EMPTY_MEDIA,
    });
    const title = getBridgeImpl()?.displayNameFor(msg.from) ?? 'Obelisk';
    // The name is in the title, as for a DM; the body never says more than
    // that a call is coming in.
    stopRing = ringIncomingCall({ id: msg.callId, title, body: tr(msg.video ? 'call.incomingVideo' : 'call.incomingVoice') }).stop;
    ringTimer = setTimeout(() => {
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
      if (status !== 'outgoing' || !session || !msg.eph) return;
      clearRinging();
      useDmCallStore.setState({ status: 'connecting' });
      session.openSignaling(msg.eph);
      session.connect();
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

function finishCall(reason: DmCallEndReason): void {
  clearRinging();
  const s = session;
  session = null;
  pendingInvite = null;
  s?.end(reason);
  useDmCallStore.setState({ status: 'ended', endReason: reason, connectedAt: null, media: EMPTY_MEDIA });
  if (lingerTimer) clearTimeout(lingerTimer);
  lingerTimer = setTimeout(() => {
    if (useDmCallStore.getState().status === 'ended') useDmCallStore.getState().dismiss();
  }, ENDED_LINGER_MS);
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
  if (lingerTimer) clearTimeout(lingerTimer);
  lingerTimer = null;
  session?.end('local-hangup');
  session = null;
  pendingInvite = null;
  unsubscribe?.();
  useDmCallStore.setState({
    status: 'idle', peer: null, callId: null, video: false, relayOnly: false, relays: [],
    media: EMPTY_MEDIA, connectedAt: null, endReason: null, error: null,
  });
}
