/**
 * The inbound signal path of a mesh room: the `subscribeSignals` callback,
 * the queue for signals from peers the client has not admitted yet, the
 * routing of a kind 25050 payload to the right `Peer` (opening one when
 * the roster has not caught up), and the capacity rejection that answers
 * an over-cap joiner with a `room-full` bye.
 *
 * Owned by `MeshSession`, which is the `MeshSignalHost`: the router reaches
 * the room, the transport and the membership decision through it and never
 * decides topology on its own.
 */
import { openMeshPeer, randomId, type MeshPeerHost } from './mesh-peer';
import { DeferredSignalQueue } from './deferred-signals';
import { pushVoiceDebug } from './debug';
import { wotEngine } from '@/services/wot/engine';
import { KIND_VOICE_SIGNAL } from '@/constants/nostr/nip-kinds';
import { MAX_PARTICIPANTS } from '@/constants/voice/client';
import type { VoiceSignalPayload } from '@/types/voice/protocol';

/** What the signal path needs from the session that owns it. */
export interface MeshSignalHost extends MeshPeerHost {
  /** NIP-29 membership plus the session's pseudo-members; the client decides. */
  isMember(pubkey: string): boolean;
  /**
   * Everyone believed to be in the room, minus self: the single input to
   * both cap checks, so the dial loop and the capacity rejection agree on
   * who the fifth person is.
   */
  roomCandidates(): string[];
}

const ROUTABLE_TYPES: ReadonlySet<string> = new Set([
  'peer', 'offer', 'answer', 'ice', 'bye', 'trackinfo', 'qualityhint', 'requestReset',
]);

export class MeshSignalRouter {
  /**
   * Inbound signals from peers we haven't yet seen as members, replayed
   * through `route` once the client admits the sender. See
   * `DeferredSignalQueue` for the bounds and the TTL.
   */
  private readonly deferred: DeferredSignalQueue;
  /** Session-level id, for signals sent without a Peer (room-full byes). Each
   *  Peer carries its own per-connection `sessionId`. */
  private readonly sessionId = randomId();

  constructor(private readonly host: MeshSignalHost) {
    this.deferred = new DeferredSignalQueue(host.metrics);
  }

  /** The `subscribeSignals` callback. */
  onInbound(from: string, payload: VoiceSignalPayload): void {
    this.host.metrics.signals.rcvd++;
    // Membership race: defer rather than silently drop. If `from`
    // becomes a member within DEFERRED_SIGNAL_TTL_MS (drained by
    // updateRoles), the queued payloads replay through `route`
    // and the call still forms. After the TTL expires the
    // membershipFinal counter increments and the signal is gone for
    // good. See Phase-1 diagnosis H2.
    if (!this.host.isMember(from)) {
      this.deferred.defer(from, payload);
      return;
    }
    if (!this.allowedByWot(from, payload, true)) return;
    void this.route(from, payload);
  }

  /** Replay queued signals for any peer who is now a member. */
  drainDeferred(): void {
    this.deferred.drain((from) => this.host.isMember(from), (from, payload) => {
      if (!this.allowedByWot(from, payload, false)) return;
      void this.route(from, payload);
    });
  }

  /** Forget every queued signal and stop the sweep. Used by `leave()`. */
  clearDeferred(): void {
    this.deferred.clear();
  }

  /**
   * WoT is defense-in-depth: voice kinds are in ALWAYS_ALLOW_KINDS so
   * `isAllowed()` returns true unconditionally. The counter remains so a
   * regression in the allow-list surfaces observably instead of silently
   * breaking voice.
   */
  private allowedByWot(from: string, payload: VoiceSignalPayload, warn: boolean): boolean {
    if (wotEngine.isAllowed(from, KIND_VOICE_SIGNAL)) return true;
    this.host.metrics.signalsDropped.wot++;
    pushVoiceDebug({ kind: 'signal-dropped', reason: 'wot', peer: from, payload });
    if (warn) console.warn('[voice-drop] wot', from.slice(0, 8), payload?.type);
    return false;
  }

  async route(fromPubkey: string, payload: VoiceSignalPayload): Promise<void> {
    const host = this.host;
    // SFU traffic flows through `SfuClient` (mediasoup-client + RPC), not
    // the mesh `Peer`. The legacy subscribeSignals delivers everything on
    // kind 25050, including RPC responses / notifications that have no
    // `type` we recognize, so we drop those here. Without this guard
    // `peer.handleSignal(undefined!.handleSignal)` throws TypeError on
    // every RPC reply from the SFU.
    const sfuPubkey = host.sfuPubkey();
    if (sfuPubkey && fromPubkey === sfuPubkey) {
      host.metrics.signalsDropped.sfuRouted++;
      pushVoiceDebug({ kind: 'signal-dropped', reason: 'sfu-routed', peer: fromPubkey });
      return;
    }
    // Defensively ignore unknown payload shapes (e.g. RPC envelopes from
    // a different peer that mistakenly addressed us).
    if (!payload || typeof payload.type !== 'string') {
      host.metrics.signalsDropped.unknownPayload++;
      pushVoiceDebug({ kind: 'signal-dropped', reason: 'unknown-payload', peer: fromPubkey });
      return;
    }
    if (!ROUTABLE_TYPES.has(payload.type)) {
      host.metrics.signalsDropped.unknownPayload++;
      pushVoiceDebug({ kind: 'signal-dropped', reason: 'unknown-payload', peer: fromPubkey, payload });
      return;
    }
    // Active capacity rejection. If this signal is from a peer who's
    // outside the lex-leading MAX_PARTICIPANTS slice, refuse to open
    // a peer and send a `bye` with `byeReason: 'room-full'`. Every
    // existing peer makes the same lex calculation, so the rejected
    // joiner gets up to MAX_PARTICIPANTS independent byes and learns
    // immediately. Already-open peers (in room.peers) bypass this
    // check: they're members of the in-set by definition.
    if (!host.room.peers.has(fromPubkey) && !this.isWithinRoomCap(fromPubkey)) {
      // The bye is how the joiner learns to stop: without it they redial
      // on every roster tick and sit on each 9 s open timeout with no error
      // shown, so a bye the relay refused is said here.
      void host.transport.sendSignal(host.channelId, fromPubkey, {
        type: 'bye',
        sessionId: this.sessionId,
        seq: 0,
        byeReason: 'room-full',
      }).catch((err) => {
        console.warn('[voice] room-full bye not delivered to', fromPubkey.slice(0, 8), err);
      });
      host.metrics.signalsDropped.unknownPayload++; // reuse counter: bumped only as "dropped at receiver"
      pushVoiceDebug({
        kind: 'signal-dropped',
        reason: 'unknown-payload',
        peer: fromPubkey,
        payload: { event: 'rejected-room-full' },
      });
      return;
    }
    let peer = host.room.peers.get(fromPubkey);
    if (!peer) {
      // Roster may not have caught up yet; create the peer eagerly so the
      // initial offer doesn't get dropped on join.
      openMeshPeer(host, fromPubkey);
      peer = host.room.peers.get(fromPubkey);
      if (!peer) return; // openMeshPeer skipped (e.g. not joined)
    }
    await peer.handleSignal(payload);
  }

  /**
   * True iff `pubkey` is in the lex-leading MAX_PARTICIPANTS slice of
   * (self + currently-known peers). Symmetric across the room: every
   * peer agrees on the same in/out partition without a coordinator.
   *
   * "Currently-known" = `roomCandidates()`, self and the candidate
   * pubkey: the same set the dial loop caps. Including the candidate
   * matters: an over-cap joiner who happens to be lex-leading should be
   * accepted, displacing the lex-trailing existing peer.
   */
  private isWithinRoomCap(pubkey: string): boolean {
    const candidates = new Set<string>(this.host.roomCandidates());
    candidates.add(this.host.selfPubkey);
    candidates.add(pubkey);
    const sorted = Array.from(candidates).sort();
    return sorted.indexOf(pubkey) < MAX_PARTICIPANTS;
  }
}
