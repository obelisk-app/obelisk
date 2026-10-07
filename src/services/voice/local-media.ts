/**
 * The local capture side of a voice room: microphone, camera and screen
 * tracks, the permission-prompt races around acquiring them, and the
 * room-wide video-slot cap.
 *
 * Publishing goes to every mesh `Peer` in the room and, when one is up,
 * to the SFU client. The SFU is looked up on every call rather than held,
 * because the topology can flip mid-call under `setExpectSfu`.
 *
 * This class holds the microphone and the one permission-race guard
 * (`keepAcquired`) every capture kind goes through. The camera and the
 * screen, with the video-slot cap, are `LocalVideo` (`local-video.ts`);
 * pushing tracks to peers is `local-media-publish.ts`.
 */
import type { Peer } from './peer';
import type { RoomState } from './room-state';
import type { VideoSlotKind, VoicePresence } from './types';
import type { VideoQuality } from './quality';
import { MIC_CONSTRAINTS } from '@/constants/voice/quality';
import { LocalVideo } from './local-video';
import {
  applyVideoQuality,
  attachAllTo,
  broadcastReceivedQuality,
  publishAllTo,
  type CapturedTracks,
  type SfuPublisher,
} from './local-media-publish';

export type { SfuPublisher } from './local-media-publish';
export { qualityHintFromPreset } from './local-media-publish';

export interface LocalTracks {
  mic: MediaStreamTrack | null;
  camera: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
}

export interface LocalMediaDeps {
  room: RoomState;
  /** The SFU client to publish to, when the room is on an SFU. */
  sfu: () => SfuPublisher | null;
  /** Latest beacon roster, for the room-wide video-slot computation. */
  roster: () => readonly VoicePresence[];
  /** A local video claim changed; the next beacon should go out soon. */
  onVideoClaimChanged: () => void;
}

export class LocalMedia {
  private micTrack: MediaStreamTrack | null = null;
  /** The camera and the screen, with the video-slot cap. */
  private readonly video: LocalVideo;
  /**
   * Bumped by every `releaseAll()`. A media acquisition that was awaiting
   * the browser's permission prompt compares the value it captured against
   * this after the await: if the user left in between, the granted track
   * is stopped on the spot instead of being parked on a dead client with
   * the tab's microphone indicator lit.
   */
  private generation = 0;

  constructor(private readonly deps: LocalMediaDeps) {
    this.video = new LocalVideo({
      room: deps.room,
      sfu: () => deps.sfu(),
      roster: () => deps.roster(),
      onVideoClaimChanged: () => deps.onVideoClaimChanged(),
      generation: () => this.generation,
      keepAcquired: (stream, generation, alreadyHeld) => this.keepAcquired(stream, generation, alreadyHeld),
      emitLocal: () => this.emitLocal(),
      setContentHint: (track, hint) => this.setContentHint(track, hint),
      stopTrack: (track) => this.stopTrack(track),
    });
  }

  private get room(): RoomState { return this.deps.room; }

  private get tracks(): CapturedTracks {
    return { mic: this.micTrack, camera: this.video.camera, screen: this.video.screen, screenAudio: this.video.screenAudio };
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  getLocalTracks(): LocalTracks {
    return { mic: this.micTrack, camera: this.video.camera, screen: this.video.screen };
  }

  getCameraFacing(): 'user' | 'environment' {
    return this.video.getCameraFacing();
  }

  /** The video kinds we advertise in our beacon. */
  videoTracks(): VideoSlotKind[] {
    return this.video.videoTracks();
  }

  // ── Publishing to peers ────────────────────────────────────────────────

  /** Push every local track, plus the quality contract, to a new mesh peer. */
  attachAllTo(peer: Peer): Promise<void> {
    return attachAllTo(this.tracks, this.room, peer);
  }

  /** Push every local track to a freshly started SFU client. */
  publishAllTo(client: SfuPublisher): Promise<void> {
    return publishAllTo(this.tracks, client);
  }

  /** User changed their outbound camera quality. Re-apply the constraints
   *  and update encoder caps on every peer. */
  applyVideoQuality(q: VideoQuality): Promise<void> {
    return applyVideoQuality(this.video.camera, this.room, q);
  }

  /** User changed their incoming-quality preference. Broadcast a qualityhint
   *  to every peer so they cap their outbound video to us. */
  broadcastReceivedQuality(q: VideoQuality): Promise<void> {
    return broadcastReceivedQuality(this.room, q);
  }

  // ── Acquisition ────────────────────────────────────────────────────────

  async setMicEnabled(on: boolean): Promise<void> {
    if (on && !this.micTrack) {
      const generation = this.generation;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: MIC_CONSTRAINTS,
      });
      if (!this.keepAcquired(stream, generation, this.micTrack !== null)) return;
      this.micTrack = stream.getAudioTracks()[0] ?? null;
      if (this.micTrack) {
        // Local speaking detector: drives the viewer's own orb without a
        // round-trip through remote peers. Detector reads via AnalyserNode
        // only (never connects to destination), so playback stays purely
        // on the outbound sender.
        this.room.attachSpeakingDetector(this.room.selfPubkey, new MediaStream([this.micTrack]));
        for (const peer of this.room.peers.values()) await peer.setLocalTrack('audio', this.micTrack);
        const sfu = this.deps.sfu();
        if (sfu) await sfu.publishTrack('audio', this.micTrack).catch((e) => console.warn('[voice] sfu publish mic threw', e));
      }
    } else if (!on && this.micTrack) {
      // Stop the local detector so the orb goes dark immediately.
      this.room.detachSpeakingDetector(this.room.selfPubkey);
      for (const peer of this.room.peers.values()) await peer.setLocalTrack('audio', null);
      // unpublishTrack warns on the RPC failure itself and always closes the producer.
      const sfu = this.deps.sfu();
      if (sfu) await sfu.unpublishTrack('audio').catch(() => undefined);
      this.stopTrack(this.micTrack);
      this.micTrack = null;
    }
    this.emitLocal();
  }

  setCameraEnabled(on: boolean): Promise<void> {
    return this.video.setCameraEnabled(on);
  }

  /** Flip between the front and back camera; a no-op while the camera is off. */
  switchCamera(): Promise<void> {
    return this.video.switchCamera();
  }

  setScreenShareEnabled(on: boolean): Promise<void> {
    return this.video.setScreenShareEnabled(on);
  }

  /**
   * Stop and forget every local capture track, and invalidate every
   * acquisition still waiting on a permission prompt. Synchronous; never
   * throws. The first thing `leave()` does.
   */
  releaseAll(): void {
    this.generation++;
    this.stopTrack(this.micTrack); this.micTrack = null;
    this.video.releaseAll();
  }

  /**
   * A capture promise resolved after the user left (or after another
   * acquisition of the same kind won). Stop what the browser handed us so
   * the capture indicator goes dark; report whether the caller may keep it.
   */
  private keepAcquired(stream: MediaStream, generation: number, alreadyHeld: boolean): boolean {
    if (generation === this.generation && !alreadyHeld) return true;
    for (const t of stream.getTracks()) this.stopTrack(t);
    return false;
  }

  // ── Video-slot cap (room-wide) ─────────────────────────────────────────

  /** Number of video slots currently in use across the room. */
  getVideoSlotsInUse(): number {
    return this.video.getVideoSlotsInUse();
  }

  getVideoSlotsAvailable(): number {
    return this.video.getVideoSlotsAvailable();
  }

  /** Re-check the cap against the latest roster; see `LocalVideo`. */
  enforceVideoSlotCap(): void {
    this.video.enforceVideoSlotCap();
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Mirror local track state to the store and the room owner. */
  emitLocal(): void {
    const local = {
      mic: !!this.micTrack,
      camera: !!this.video.camera,
      screen: !!this.video.screen,
    };
    // Mirror to the global voice store so VoiceStatusBar (and any other
    // surface that reads from the store) stays accurate even when the
    // room component is unmounted, e.g. while the user is viewing a
    // text channel during an active call. The room's events handler is
    // a UI-only superset; it gets the same payload via the call below.
    this.room.ui.setLocalTracks(local);
    this.room.events.onLocalTracksChange?.(local);
  }

  private setContentHint(track: MediaStreamTrack, hint: 'motion' | 'detail' | 'music'): void {
    // Per spec an unsupported hint is ignored, not thrown; the guard is for
    // engines predating the property as a setter.
    try { track.contentHint = hint; } catch { /* older browsers */ }
  }

  private stopTrack(t: MediaStreamTrack | null): void {
    if (!t) return;
    try { t.stop(); } catch { /* stop() cannot throw per spec; guard is for non-conforming fakes */ }
  }
}
