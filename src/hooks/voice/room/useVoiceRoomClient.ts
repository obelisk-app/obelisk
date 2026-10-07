'use client';

/**
 * Phase 2 of the voice room: the call itself. Once the gate is `ready` and
 * the user has pressed Join, this hook attaches to the running
 * `VoiceClient` for the channel (navigating back into a live call) or
 * builds and joins a new one, mirrors the client's events into React
 * state and the voice store, keeps the live client fed with the passive
 * roster and the expected topology, runs the SFU supervisor, and owns
 * `leave`.
 *
 * `clientRef` is shared with `useVoiceRoomGate`, which pushes role and
 * openness changes into whatever client is running; the component creates
 * it and hands it to both.
 */
import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import { VoiceClient, type RemoteTrack } from '@/services/voice/client';
import { setActiveVoiceClient, getActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceSigner } from '@/constants/voice/client';
import type { ActiveCallInfo } from '@/services/nostr-bridge';
import { useVoiceStore } from '@/store/voice';
import { voiceErrorCode, type VoiceErrorCode } from '@/utils/voice/errors';
import type { AuthGate } from './useVoiceRoomGate';
import { useSfuSupervisor } from './useSfuSupervisor';
import {
  hydrateFromClient,
  makeRoomEvents,
  resetRoomState,
  type LocalTrackFlags,
  type LocalVideoTracks,
  type SfuStatus,
} from '@/services/voice/room-events';
import { NO_LOCAL, NO_LOCAL_VIDEO } from '@/constants/voice/room-events';

export type { LocalTrackFlags, LocalVideoTracks } from '@/services/voice/room-events';

export interface VoiceRoomClientState {
  /** True while this component's channel is the joined one. */
  joined: boolean;
  /** The Join button. */
  join: () => void;
  /** Tear down the call and reset the store, even if the client rejects. */
  leave: () => Promise<void>;
  participants: string[];
  remoteTracks: RemoteTrack[];
  peerConnectionStates: Record<string, RTCPeerConnectionState>;
  local: LocalTrackFlags;
  /** The local camera and screen tracks; a new object only when a track changes. */
  localVideo: LocalVideoTracks;
  /** SFU upgrade status for the current call; see `SfuStatus`. */
  sfuStatus: SfuStatus;
}

export function useVoiceRoomClient({
  channelId,
  clientRef,
  gate,
  expectSfu,
  activeCall,
  currentRelayUrl,
  loginMethod,
  setError,
}: {
  channelId: string;
  clientRef: MutableRefObject<VoiceClient | null>;
  gate: AuthGate;
  expectSfu: boolean;
  activeCall: ActiveCallInfo | null;
  currentRelayUrl: string | null;
  loginMethod: VoiceSigner | null;
  setError: (code: VoiceErrorCode | null) => void;
}): VoiceRoomClientState {
  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [peerConnectionStates, setPeerConnectionStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [local, setLocal] = useState<LocalTrackFlags>(NO_LOCAL);
  const [localVideo, setLocalVideo] = useState<LocalVideoTracks>(NO_LOCAL_VIDEO);
  const [joinedChannelId, setJoinedChannelId] = useState<string | null>(() => {
    const c = getActiveVoiceClient();
    return c && c.isJoined() ? c.channelId : null;
  });
  const joined = joinedChannelId === channelId;

  const [sfuStatus, setSfuStatus] = useState<SfuStatus>('na');
  /**
   * Republish trigger, incremented by `onTopologyChange` when an SFU
   * peer drops out of the roster after we'd been connected to it. The
   * supervisor effect watches this and re-publishes kind 25052 (with
   * force=true so the rate-limit doesn't swallow the recovery), so a
   * brief SFU restart is recovered without the user having to rejoin.
   */
  const [sfuRepublishCounter, setSfuRepublishCounter] = useState(0);

  // useState setters are stable, so this is one object for the hook's life.
  const sinks = useMemo(
    () => ({ setParticipants, setRemoteTracks, setPeerConnectionStates, setLocal, setLocalVideo }),
    [],
  );

  useEffect(() => {
    if (joined) return;
    clientRef.current = null;
    resetRoomState(sinks);
  }, [channelId, joined, clientRef, sinks]);

  // Once gated AND joined, attach to/start the call.
  useEffect(() => {
    if (gate.phase !== 'ready') return;
    if (!joined) return;
    let cancelled = false;
    const store = useVoiceStore.getState();
    store.setError(null);
    const events = makeRoomEvents({
      ...sinks,
      expectSfu,
      setSfuStatus,
      bumpRepublish: () => setSfuRepublishCounter((n) => n + 1),
      setError,
      isCancelled: () => cancelled,
      readLocalVideo: () => {
        const tracks = (clientRef.current ?? getActiveVoiceClient())?.getLocalTracks();
        return tracks ? { camera: tracks.camera, screen: tracks.screen } : NO_LOCAL_VIDEO;
      },
    });

    const existing = getActiveVoiceClient();
    if (existing && existing.channelId === channelId && existing.isJoined()) {
      existing.setEvents(events);
      // Reapply expected-topology so a channel-kind reclassification
      // mid-call (admin republished kind 39000 with/without
      // ["t","voice-sfu"]) flips the live client immediately.
      existing.setExpectSfu(expectSfu);
      if (activeCall?.mode === 'mesh') {
        existing.setPassiveParticipantHints(activeCall.participantPubkeys ?? []);
      } else {
        existing.setPassiveParticipantHints([]);
      }
      clientRef.current = existing;
      hydrateFromClient(existing, sinks);
      const s = useVoiceStore.getState();
      s.setVoiceChannel(channelId, currentRelayUrl);
      s.setConnecting(false);
      return () => {
        cancelled = true;
        if (clientRef.current === existing) {
          existing.setEvents({});
          clientRef.current = null;
        }
      };
    }

    // Hand off the prior client's leave promise into the async IIFE so we
    // can await it BEFORE constructing the next VoiceClient. Pre-fix the
    // void-leave fired and we immediately raced into the new join while
    // the old client's transports + leave RPC were still settling. Net
    // effect: the SFU saw a new peerJoined for the new room while still
    // holding the old peer entry for the prior room, doubling everyone's
    // beacon-discovery roster work and (in the worst case) leaving stale
    // peer entries until the empty-grace / RTP reaper caught up.
    const priorLeave = (existing && existing.channelId !== channelId)
      ? existing.leave()
      : null;
    if (priorLeave) setActiveVoiceClient(null);

    store.setConnecting(true);
    let client: VoiceClient | null = null;

    (async () => {
      try {
        if (priorLeave) {
          // Bound the wait so a hung leave (dead relay, slow signer)
          // can't deadlock the UI. Past the budget the new join goes
          // ahead and the SFU's RTP-inactivity reaper or empty-grace
          // timer cleans up the prior room.
          await Promise.race([
            priorLeave.catch(() => undefined),
            new Promise<void>((r) => setTimeout(r, 800)),
          ]);
          if (cancelled) return;
        }
        client = new VoiceClient(channelId, {
          members: gate.members,
          admins: gate.admins,
          open: gate.open,
          expectSfu: expectSfu,
          signer: loginMethod ?? 'nsec',
          originRelayUrl: currentRelayUrl,
          events,
        });
        clientRef.current = client;
        setActiveVoiceClient(client);
        if (activeCall?.mode === 'mesh') {
          client.setPassiveParticipantHints(activeCall.participantPubkeys ?? []);
        }
        await client.join();
        // The store describes the client, not this component. Even if this
        // effect was cancelled while the relay answered (the user opened
        // another channel), the call is live and registered as the active
        // client, and the status bar needs the channel id to offer Leave.
        const s = useVoiceStore.getState();
        s.setVoiceChannel(channelId, currentRelayUrl);
        s.setConnecting(false);
        if (cancelled) return;
      } catch (e) {
        if (client) {
          await client.leave().catch((leaveErr) => {
            console.warn('[voice] leave after a failed join threw', leaveErr);
          });
          if (getActiveVoiceClient() === client) setActiveVoiceClient(null);
          if (clientRef.current === client) clientRef.current = null;
        }
        console.warn('[voice] join failed', e);
        const code = voiceErrorCode(e, 'join');
        if (!cancelled) {
          setJoinedChannelId(null);
          setError(code);
          useVoiceStore.getState().setError(code);
          useVoiceStore.getState().setConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.setEvents({});
        clientRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.phase, channelId, joined, expectSfu, loginMethod]);

  // Feed the joined mesh client with the same passive live-call roster used
  // by the pre-join UI. This gives mesh bootstrap a second source when an
  // ephemeral roster REQ misses a beacon but the bridge-level call detector
  // has already seen it.
  useEffect(() => {
    const c = clientRef.current ?? getActiveVoiceClient();
    if (!joined || !c || c.channelId !== channelId) return;
    if (typeof c.setPassiveParticipantHints !== 'function') return;
    if (activeCall?.mode === 'mesh') {
      c.setPassiveParticipantHints(activeCall.participantPubkeys ?? []);
    } else {
      c.setPassiveParticipantHints([]);
    }
  }, [joined, channelId, activeCall?.mode, activeCall?.participantPubkeys, clientRef]);

  // Mirror channel-kind reclassifications into the running voice client.
  // If the admin republishes kind 39000 toggling ["t","voice-sfu"] while
  // a call is live, this flips the client's topology gate without forcing
  // anyone to leave the call. Kept thin because the actual switch lives in
  // the client: setExpectSfu tears down one topology and enters the other.
  useEffect(() => {
    const c = clientRef.current ?? getActiveVoiceClient();
    if (!c || c.channelId !== channelId) return;
    c.setExpectSfu(expectSfu);
  }, [expectSfu, channelId, clientRef]);

  useSfuSupervisor({
    active: gate.phase === 'ready' && joined,
    expectSfu,
    channelId,
    republishCounter: sfuRepublishCounter,
    setSfuStatus,
  });

  const leave = useCallback(async () => {
    const c = clientRef.current ?? getActiveVoiceClient();
    clientRef.current = null;
    try {
      if (c) await c.leave();
    } catch (err) {
      // The client releases its media before anything that can throw, so
      // the user is off the air; drop the call locally rather than leave
      // a Leave button that does nothing.
      console.warn('[voice] leave failed; the call was dropped locally anyway', err);
    }
    setActiveVoiceClient(null);
    useVoiceStore.getState().leaveVoice();
    setJoinedChannelId(null);
    resetRoomState(sinks);
  }, [clientRef, sinks]);

  // Mirror externally-driven hangups (e.g. the VoiceStatusBar leave button)
  // back into local state so the room flips to the "Join voice channel"
  // landing instead of staying on a stale connected view.
  useEffect(() => {
    const unsub = useVoiceStore.subscribe((state, prev) => {
      if (prev.currentVoiceChannelId === channelId && state.currentVoiceChannelId !== channelId) {
        clientRef.current = null;
        setJoinedChannelId(null);
        resetRoomState(sinks);
      }
    });
    return unsub;
  }, [channelId, clientRef, sinks]);

  const join = useCallback(() => { setJoinedChannelId(channelId); }, [channelId]);

  return { joined, join, leave, participants, remoteTracks, peerConnectionStates, local, localVideo, sfuStatus };
}
