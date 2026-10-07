/**
 * The DM call store: state, the user's actions, and `finishCall`, the one
 * way a call ends. Re-exported from `dm-call.ts`, which also routes the
 * control messages that arrive from the other side.
 */
import { create } from 'zustand';
import { generateSecretKey } from 'nostr-tools';
import { getPreferences } from '@/services/preferences/preferences';
import { startRingback } from '@/services/notifications/alert';
import { newCallId } from '@/services/call/protocol';
import { CALL_RING_TIMEOUT_MS } from '@/constants/call/protocol';
import type { DmCallMediaState, DmCallPhase, DmCallSession } from '@/services/call/session';
import { loadDmCallSession } from '@/services/call/load-session';
import { iceTransportPolicyFor, leaveGroupVoice, lost, send } from './dm-call-policy';
import { clearRinging, rt } from './dm-call-runtime';
import { mediaDeviceProblem, type MediaDeviceProblem } from '@/utils/voice/errors';

export type DmCallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'reconnecting' | 'ended';

export type DmCallEndReason =
  | 'local-hangup' | 'remote-hangup' | 'declined' | 'busy' | 'no-answer' | 'missed'
  | 'cancelled' | 'answered-elsewhere' | 'connect-failed' | 'connection-lost' | 'error';

/** A failure the call card shows, resolved as `calls.call.error.<code>`. */
export type DmCallErrorCode = 'load' | 'mic' | 'send' | 'camera' | 'flip' | 'screen' | MediaDeviceProblem;

/** A browser media problem by name when there is one, otherwise `fallback`. */
function callErrorCode(e: unknown, fallback: DmCallErrorCode): DmCallErrorCode {
  console.warn('[dm-call]', fallback, 'failed', e);
  return mediaDeviceProblem(e) ?? fallback;
}

export const EMPTY_MEDIA: DmCallMediaState = {
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

export interface DmCallState {
  status: DmCallStatus;
  peer: string | null;
  callId: string | null;
  /** The call started as a video call. */
  video: boolean;
  /** Traffic is forced through TURN (the other side can't see our IP). */
  relayOnly: boolean;
  relays: readonly string[];
  media: DmCallMediaState;
  /** ms epoch the media connected - for the call timer. */
  connectedAt: number | null;
  endReason: DmCallEndReason | null;
  error: DmCallErrorCode | null;

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

export const useDmCallStore = create<DmCallState>((set, get) => {
  function makeSession(
    Session: typeof DmCallSession,
    role: 'caller' | 'callee', callId: string, relays: readonly string[], video: boolean, peer: string,
  ): DmCallSession {
    const relayOnly = iceTransportPolicyFor(peer) === 'relay';
    set({ relayOnly });
    const s = new Session({
      role,
      callId,
      selfSk: generateSecretKey(),
      relays,
      video,
      iceTransportPolicy: relayOnly ? 'relay' : 'all',
      onMedia: (media) => { if (rt.session === s) set({ media }); },
      // The callee's hello reached us on the call relay - usually before the
      // gift-wrapped accept does. Stop ringing; the session is connecting.
      onPeerJoined: () => {
        if (rt.session !== s || get().status !== 'outgoing') return;
        clearRinging();
        set({ status: 'connecting' });
      },
      onPhase: (phase: DmCallPhase, reason?: string) => {
        if (rt.session !== s) return;
        if (phase === 'connected') {
          set({ status: 'active', connectedAt: get().connectedAt ?? Date.now() });
        } else if (phase === 'reconnecting') {
          set({ status: 'reconnecting' });
        } else if (phase === 'ended') {
          const known: DmCallEndReason[] = ['local-hangup', 'remote-hangup', 'connect-failed', 'connection-lost'];
          const r = (known as string[]).includes(reason ?? '') ? reason as DmCallEndReason : 'error';
          // Tell the other side over the gift-wrap path too; its relay may be
          // the one that failed.
          if (r === 'connect-failed' || r === 'connection-lost') void send(peer, { type: 'hangup', callId }).catch(lost('hangup'));
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
      if (rt.lingerTimer) clearTimeout(rt.lingerTimer);
      const callId = newCallId();
      const relays = getPreferences().callRelays;
      // "Calling..." shows at once, and a second click finds the call already
      // under way. The media stack downloads meanwhile (load-session.ts).
      set({ status: 'outgoing', peer, callId, video, relays, endReason: null, error: null, connectedAt: null });
      const loading = loadDmCallSession();
      await leaveGroupVoice();
      let Session: typeof DmCallSession;
      try {
        Session = (await loading).DmCallSession;
      } catch (e) {
        if (get().callId !== callId) return;
        set({ error: callErrorCode(e, 'load') });
        finishCall('error');
        return;
      }
      // Hung up (or replaced) while the call was still loading.
      if (get().callId !== callId || get().status !== 'outgoing') return;
      const s = makeSession(Session, 'caller', callId, relays, video, peer);
      rt.session = s;
      try {
        await s.acquireMedia();
      } catch (e) {
        set({ error: callErrorCode(e, 'mic') });
        finishCall('error');
        return;
      }
      if (rt.session !== s) return;
      // Subscribe on the call relays now, while it rings: by the time the
      // callee answers, our REQ is long live.
      s.listen();
      rt.stopRing = startRingback().stop;
      rt.ringTimer = setTimeout(() => {
        if (rt.session !== s || get().status !== 'outgoing') return;
        void send(peer, { type: 'cancel', callId }).catch(lost('cancel'));
        finishCall('no-answer');
      }, CALL_RING_TIMEOUT_MS);
      try {
        await send(peer, { type: 'invite', callId, eph: s.selfEph, relays, video });
      } catch (e) {
        set({ error: callErrorCode(e, 'send') });
        finishCall('error');
      }
    },

    async acceptCall(video) {
      const invite = rt.pendingInvite;
      if (!invite || get().status !== 'incoming' || !invite.eph || !invite.relays) return;
      clearRinging();
      // Usually already here: ringing started the download.
      const loading = loadDmCallSession();
      await leaveGroupVoice();
      let Session: typeof DmCallSession;
      try {
        Session = (await loading).DmCallSession;
      } catch (e) {
        if (rt.pendingInvite !== invite || get().status !== 'incoming') return;
        set({ error: callErrorCode(e, 'load') });
        void send(invite.from, { type: 'decline', callId: invite.callId }, true).catch(lost('decline'));
        finishCall('error');
        return;
      }
      // Cancelled, declined elsewhere or accepted twice while it loaded.
      if (rt.pendingInvite !== invite || get().status !== 'incoming') return;
      const s = makeSession(Session, 'callee', invite.callId, invite.relays, video, invite.from);
      rt.session = s;
      set({ status: 'connecting', video });
      try {
        await s.acquireMedia();
      } catch (e) {
        set({ error: callErrorCode(e, 'mic') });
        void send(invite.from, { type: 'decline', callId: invite.callId }, true).catch(lost('decline'));
        finishCall('error');
        return;
      }
      if (rt.session !== s) return;
      // Two paths to the caller, raced: the hello on the call relay (fast  - 
      // no signer, no inbox lookup) and the gift-wrapped accept (the one that
      // also tells our other devices to stop ringing). Either is enough.
      void s.answer(invite.eph);
      void send(invite.from, { type: 'accept', callId: invite.callId, eph: s.selfEph }, true).catch((e) => {
        // The hello may already have connected us; only a call still waiting
        // on the other side is lost without this.
        console.warn('[dm-call] accept gift wrap failed', e);
      });
    },

    declineCall() {
      const invite = rt.pendingInvite;
      if (!invite || get().status !== 'incoming') return;
      void send(invite.from, { type: 'decline', callId: invite.callId }, true).catch(lost('decline'));
      finishCall('declined');
    },

    hangup() {
      const { status, peer, callId } = get();
      if (!peer || !callId) return;
      if (status === 'incoming') { get().declineCall(); return; }
      if (status === 'outgoing') {
        // No session yet means the call was still loading: no invite went out.
        if (rt.session) void send(peer, { type: 'cancel', callId }).catch(lost('cancel'));
        finishCall('cancelled');
        return;
      }
      if (status === 'connecting' || status === 'active' || status === 'reconnecting') {
        // Bye over the call relay (fast) and over the gift-wrap path (sure).
        rt.session?.hangup();
        void send(peer, { type: 'hangup', callId }).catch(lost('hangup'));
        finishCall('local-hangup');
      }
    },

    setMic(on) { rt.session?.setMic(on); },
    async setCamera(on) {
      try { await rt.session?.setCamera(on); } catch (e) { set({ error: callErrorCode(e, 'camera') }); }
    },
    async flipCamera() {
      try { await rt.session?.flipCamera(); } catch (e) { set({ error: callErrorCode(e, 'flip') }); }
    },
    async setScreenShare(on) {
      try { await rt.session?.setScreenShare(on); } catch (e) {
        // Cancelling the browser's picker is not an error worth showing.
        if ((e as Error).name !== 'NotAllowedError') set({ error: callErrorCode(e, 'screen') });
      }
    },

    dismiss() {
      if (rt.lingerTimer) clearTimeout(rt.lingerTimer);
      rt.lingerTimer = null;
      if (get().status !== 'ended' && get().status !== 'idle') return;
      set({ status: 'idle', peer: null, callId: null, video: false, relayOnly: false, relays: [], media: EMPTY_MEDIA, endReason: null, error: null, connectedAt: null });
    },
  };
});

export function finishCall(reason: DmCallEndReason): void {
  clearRinging();
  const s = rt.session;
  rt.session = null;
  rt.pendingInvite = null;
  s?.end(reason);
  useDmCallStore.setState({ status: 'ended', endReason: reason, connectedAt: null, media: EMPTY_MEDIA });
  if (rt.lingerTimer) clearTimeout(rt.lingerTimer);
  rt.lingerTimer = setTimeout(() => {
    if (useDmCallStore.getState().status === 'ended') useDmCallStore.getState().dismiss();
  }, ENDED_LINGER_MS);
}
