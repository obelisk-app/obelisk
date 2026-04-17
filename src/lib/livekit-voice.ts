/**
 * LiveKit-backed voice client for large rooms (SFU mode).
 *
 * Exposes the same public surface as `WebSocketVoiceClient` (the P2P mesh
 * client) so `src/app/chat/page.tsx` can pick between them with a single
 * factory line. Callbacks emit the same shapes — the UI doesn't know or
 * care which backend is running.
 *
 * Responsibilities that the mesh client handles manually but LiveKit does
 * natively (so we just forward events):
 *   - Speaking detection via `ActiveSpeakersChanged`
 *   - Reconnection / ICE restart / hard reset
 *   - Simulcast + adaptive quality per subscriber
 *   - Autoplay / audio element lifecycle via `track.attach()`
 */

import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  createLocalScreenTracks,
} from 'livekit-client';
import type {
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Participant,
  LocalParticipant,
  LocalTrackPublication,
} from 'livekit-client';

export interface LiveKitVoiceClientOptions {
  /**
   * Called when we need to mint a token. Typically fetches from
   * `/api/voice/token?channelId=…`. Separated out so tests can inject.
   */
  tokenFetcher: (channelId: string) => Promise<{ url: string; token: string }>;
}

export class LiveKitVoiceClient {
  private readonly tokenFetcher: LiveKitVoiceClientOptions['tokenFetcher'];
  private room: Room | null = null;
  private channelId: string | null = null;
  private isMuted = false;
  private isDeafened = false;
  // Pubkeys the local viewer has silenced — we apply via per-participant
  // volume on every track attach and after reconnects since LiveKit doesn't
  // persist the setting across subscription changes.
  private locallyMuted = new Set<string>();

  // ── Callbacks (identical to WebSocketVoiceClient) ─────────────────
  onConnectionStateChange?: (state: string) => void;
  onError?: (error: string) => void;
  onForceMute?: (reason: string) => void;
  onForceCameraOff?: (reason: string) => void;
  onForceScreenOff?: (reason: string) => void;
  onRemoteVideoElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  onRemoteScreenElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  onLocalCameraStream?: (stream: MediaStream | null) => void;
  onLocalScreenStream?: (stream: MediaStream | null) => void;
  onSpeakingChange?: (pubkey: string, speaking: boolean) => void;

  constructor(opts: LiveKitVoiceClientOptions) {
    this.tokenFetcher = opts.tokenFetcher;
  }

  // ── Join / Leave ──────────────────────────────────────────────────

  async join(channelId: string): Promise<void> {
    if (this.room) return;
    this.channelId = channelId;

    // LiveKit drives adaptive simulcast automatically when `adaptiveStream`
    // is true: the SFU forwards the layer each subscriber can actually use,
    // so listeners with small camera tiles save bandwidth without any
    // per-client orchestration.
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h540, VideoPresets.h720],
      },
    });
    this.room = room;

    this.wireRoomEvents(room);

    let url: string;
    let token: string;
    try {
      ({ url, token } = await this.tokenFetcher(channelId));
    } catch (err) {
      this.onError?.(
        err instanceof Error && err.message
          ? `Voice server not available — ${err.message}`
          : 'Voice server not available',
      );
      this.room = null;
      throw err;
    }

    try {
      await room.connect(url, token);
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Failed to connect to voice server');
      this.room = null;
      throw err;
    }

    // Match the mesh client's "join muted" default — the mic publication
    // activates as soon as the user unmutes. Acquiring it here (as a muted
    // track) also hints the browser that this is a communication session,
    // avoiding the "audio tagged as background music" OS-level quirk.
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      // LiveKit's "setMicrophoneEnabled(true)" publishes AND unmutes. Flip
      // the mute immediately so we stay silent until the user chooses.
      await this.setLocalMicEnabled(false);
      this.isMuted = true;
    } catch {
      // Mic permission denied or unavailable — user can still listen.
    }

    this.onConnectionStateChange?.('connected');
  }

  async leave(): Promise<void> {
    const room = this.room;
    this.room = null;
    this.channelId = null;
    this.onLocalCameraStream?.(null);
    this.onLocalScreenStream?.(null);
    this.onConnectionStateChange?.('disconnected');
    if (!room) return;
    try { await room.disconnect(); } catch {}
  }

  destroy(): void { this.leave(); }

  // ── Audio controls ────────────────────────────────────────────────

  mute(): void {
    this.isMuted = true;
    void this.setLocalMicEnabled(false);
  }

  async unmute(): Promise<void> {
    this.isMuted = false;
    try {
      await this.setLocalMicEnabled(true);
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to unmute');
    }
  }

  setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    const room = this.room;
    if (!room) return;
    // Zero every remote audio track's volume. LiveKit applies it per
    // participant+track so we iterate explicitly — there's no "room-wide
    // silence" API.
    for (const participant of room.remoteParticipants.values()) {
      this.applyParticipantVolume(participant);
    }
  }

  /**
   * Silence a specific remote peer for the local viewer only. Unlike the
   * moderator force-mute, this never leaves the browser — it's purely a
   * local volume gate.
   */
  setPeerMuted(pubkey: string, muted: boolean): void {
    if (muted) this.locallyMuted.add(pubkey);
    else this.locallyMuted.delete(pubkey);
    const room = this.room;
    if (!room) return;
    const participant = this.findRemoteParticipant(pubkey);
    if (participant) this.applyParticipantVolume(participant);
  }

  // ── Camera ────────────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(true, {
        resolution: VideoPresets.h1080.resolution,
      });
      this.onLocalCameraStream?.(this.getLocalCameraStream());
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Failed to start camera');
      throw err;
    }
  }

  /**
   * Re-apply user voice-quality settings to the live call. LiveKit handles
   * encoding parameters internally (simulcast + dynacast + adaptive stream),
   * so there's no sender-level retune here — we only restart the camera if
   * it's active, which is the only way to pick up a new resolution preset.
   */
  async applyLiveQualitySettings(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const camPub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (camPub && camPub.track) {
      try {
        await this.stopCamera();
        await this.startCamera();
      } catch (err) {
        console.warn('[livekit-voice] camera restart after settings change failed:', err);
      }
    }
  }

  async stopCamera(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      await room.localParticipant.setCameraEnabled(false);
    } finally {
      this.onLocalCameraStream?.(null);
    }
  }

  // ── Screen share ──────────────────────────────────────────────────

  async startScreenShare(): Promise<void> {
    const room = this.room;
    if (!room) return;
    try {
      // Create the tracks ourselves so we can surface the MediaStream to
      // the UI for a local preview — LiveKit's built-in toggle hides the
      // underlying stream behind the publication object.
      const tracks = await createLocalScreenTracks({
        audio: true,
        resolution: VideoPresets.h1440.resolution,
      });
      for (const track of tracks) {
        await room.localParticipant.publishTrack(track, { source: track.source });
      }
      this.onLocalScreenStream?.(this.getLocalScreenStream());
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Failed to start screen share');
      throw err;
    }
  }

  async stopScreenShare(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const screenPubs = this.getLocalScreenPublications(room.localParticipant);
    for (const pub of screenPubs) {
      if (pub.track) {
        await room.localParticipant.unpublishTrack(pub.track, true);
      }
    }
    this.onLocalScreenStream?.(null);
  }

  // ── Internals ─────────────────────────────────────────────────────

  private wireRoomEvents(room: Room): void {
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      this.onConnectionStateChange?.(String(state));
    });
    room.on(RoomEvent.Disconnected, () => {
      this.onConnectionStateChange?.('disconnected');
    });

    // LiveKit's built-in speaking detection — fires with the current list
    // of active speakers. We diff against our known-speaking set and emit
    // per-pubkey transitions the store can consume identically to the
    // mesh client's SpeakingDetector callbacks.
    let lastSpeaking = new Set<string>();
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const next = new Set<string>();
      for (const s of speakers) next.add(s.identity);
      for (const pk of next) {
        if (!lastSpeaking.has(pk)) this.onSpeakingChange?.(pk, true);
      }
      for (const pk of lastSpeaking) {
        if (!next.has(pk)) this.onSpeakingChange?.(pk, false);
      }
      lastSpeaking = next;
    });

    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      this.handleRemoteTrack(track, pub, participant);
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, pub, participant) => {
      this.handleRemoteTrackRemoved(pub, participant);
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      // Any remaining callbacks for this pubkey — flip their elements to null.
      this.onRemoteVideoElement?.(participant.identity, null);
      this.onRemoteScreenElement?.(participant.identity, null);
      this.onSpeakingChange?.(participant.identity, false);
    });
  }

  private handleRemoteTrack(
    track: RemoteTrack,
    pub: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    if (track.kind === Track.Kind.Video) {
      const el = track.attach() as HTMLVideoElement;
      el.autoplay = true;
      el.playsInline = true;
      if (pub.source === Track.Source.ScreenShare) {
        this.onRemoteScreenElement?.(participant.identity, el);
      } else {
        this.onRemoteVideoElement?.(participant.identity, el);
      }
      return;
    }
    // Audio: attach silently (LiveKit handles autoplay via a hidden audio
    // element) and apply any pending local-mute / deafen state.
    track.attach();
    this.applyParticipantVolume(participant);
  }

  private handleRemoteTrackRemoved(
    pub: RemoteTrackPublication,
    participant: RemoteParticipant,
  ): void {
    if (pub.kind === Track.Kind.Video) {
      if (pub.source === Track.Source.ScreenShare) {
        this.onRemoteScreenElement?.(participant.identity, null);
      } else {
        this.onRemoteVideoElement?.(participant.identity, null);
      }
    }
  }

  private applyParticipantVolume(participant: RemoteParticipant): void {
    const silent = this.isDeafened || this.locallyMuted.has(participant.identity);
    // `setVolume` applies to every audio track the participant has
    // published, including screen-share audio, so deafen + local-mute both
    // cover the full audio output from that peer.
    try { participant.setVolume(silent ? 0 : 1); } catch {}
  }

  private findRemoteParticipant(pubkey: string): RemoteParticipant | null {
    const room = this.room;
    if (!room) return null;
    for (const participant of room.remoteParticipants.values()) {
      if (participant.identity === pubkey) return participant;
    }
    return null;
  }

  private async setLocalMicEnabled(enabled: boolean): Promise<void> {
    const room = this.room;
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (!pub) {
      if (enabled) await room.localParticipant.setMicrophoneEnabled(true);
      return;
    }
    if (enabled) await pub.unmute();
    else await pub.mute();
  }

  private getLocalCameraStream(): MediaStream | null {
    const room = this.room;
    if (!room) return null;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track?.mediaStreamTrack;
    return track ? new MediaStream([track]) : null;
  }

  private getLocalScreenStream(): MediaStream | null {
    const room = this.room;
    if (!room) return null;
    const videoPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShare);
    const audioPub = room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    const tracks: MediaStreamTrack[] = [];
    if (videoPub?.track?.mediaStreamTrack) tracks.push(videoPub.track.mediaStreamTrack);
    if (audioPub?.track?.mediaStreamTrack) tracks.push(audioPub.track.mediaStreamTrack);
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }

  private getLocalScreenPublications(local: LocalParticipant): LocalTrackPublication[] {
    const out: LocalTrackPublication[] = [];
    for (const pub of local.trackPublications.values()) {
      if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
        out.push(pub);
      }
    }
    return out;
  }
}

/**
 * Default token fetcher that hits the server's `/api/voice/token` route.
 * Pulled out so tests can swap it. Returns the LiveKit wss URL + JWT.
 */
export async function fetchVoiceToken(channelId: string): Promise<{ url: string; token: string }> {
  const res = await fetch(`/api/voice/token?channelId=${encodeURIComponent(channelId)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error('the host has not deployed a voice server');
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Token request failed (${res.status})`);
  }
  return res.json();
}
