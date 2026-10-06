/**
 * The camera and the screen of a voice room: acquiring them under the
 * room-wide video-slot cap, flipping the camera, the browser-driven stop,
 * and the eviction when a remote claim turns out to be older than ours.
 *
 * The permission-race guard is the host's (`LocalMedia.keepAcquired`),
 * one implementation for every capture kind: an acquisition that resolves
 * after the user left, or after another acquisition of the same kind won,
 * is stopped on the spot.
 */
import type { RoomState } from './room-state';
import type { VideoSlotKind, VoicePresence } from './types';
import { getPreset } from './quality';
import { MAX_CAMERAS } from './constants';
import { VoiceError } from './errors';
import type { SfuPublisher } from './local-media-publish';
import {
  buildVideoSlotList,
  cameraSlotsInUse,
  canClaimVideoSlot,
  videoSlotWinners,
  type VideoSlotClaim,
} from './video-slots';

export interface LocalVideoHost {
  readonly room: RoomState;
  /** The SFU client to publish to, when the room is on an SFU. */
  sfu(): SfuPublisher | null;
  /** Latest beacon roster, for the room-wide video-slot computation. */
  roster(): readonly VoicePresence[];
  /** A local video claim changed; the next beacon should go out soon. */
  onVideoClaimChanged(): void;
  /** The value `keepAcquired` compares against; read before the prompt. */
  generation(): number;
  /** Whether a capture that just resolved may be kept; see `LocalMedia`. */
  keepAcquired(stream: MediaStream, generation: number, alreadyHeld: boolean): boolean;
  /** Mirror local track state to the store and the room owner. */
  emitLocal(): void;
  setContentHint(track: MediaStreamTrack, hint: 'motion' | 'detail' | 'music'): void;
  stopTrack(track: MediaStreamTrack | null): void;
}

export class LocalVideo {
  camera: MediaStreamTrack | null = null;
  screen: MediaStreamTrack | null = null;
  screenAudio: MediaStreamTrack | null = null;
  /**
   * Last requested camera facing, flipped by `switchCamera()` and used
   * as the `facingMode` hint when (re-)acquiring the camera. Desktops
   * typically ignore the hint and just hand back the default device.
   */
  private cameraFacing: 'user' | 'environment' = 'user';
  /**
   * Wall-clock seconds when each of our local video tracks claimed its
   * slot. Race resolution sorts by `(claimedAt asc, pubkey asc)` so an
   * older track wins against a later one, matches the relay-sourced
   * `createdAt` ordering used for remote claims.
   */
  private readonly localVideoClaimedAt = new Map<VideoSlotKind, number>();

  constructor(private readonly host: LocalVideoHost) {}

  private get room(): RoomState { return this.host.room; }

  getCameraFacing(): 'user' | 'environment' {
    return this.cameraFacing;
  }

  /** The video kinds we advertise in our beacon. */
  videoTracks(): VideoSlotKind[] {
    const kinds: VideoSlotKind[] = [];
    if (this.camera) kinds.push('camera');
    if (this.screen) kinds.push('screen');
    return kinds;
  }

  // ── Acquisition ────────────────────────────────────────────────────────

  async setCameraEnabled(on: boolean): Promise<void> {
    console.log('[voice] setCameraEnabled', on, 'peers=', this.room.peers.size);
    if (on && !this.camera) {
      // Room-wide video-slot cap: refuse early if every slot is already
      // claimed. Race-overflow (two peers claim simultaneously) is
      // resolved by `enforceVideoSlotCap` once beacons round-trip.
      if (!this.canClaimVideoSlot('camera')) {
        this.room.ui.setError('cameraLimit');
        throw new VoiceError('cameraLimit', 'Camera limit reached (4/4). Ask someone to turn off their camera.');
      }
      const quality = this.room.ui.readVideoQuality().videoQuality;
      const preset = getPreset(quality);
      const generation = this.host.generation();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { ...preset.constraints, facingMode: this.cameraFacing },
      });
      if (!this.host.keepAcquired(stream, generation, this.camera !== null)) return;
      this.camera = stream.getVideoTracks()[0] ?? null;
      console.log('[voice] camera acquired, track=', this.camera?.id, 'quality=', quality);
      if (this.camera) {
        // Bias the encoder toward smooth motion (faces, gestures) over
        // peak per-frame resolution. Browsers honor this when picking
        // between motion-vector vs intra-frame compression strategies.
        this.host.setContentHint(this.camera, 'motion');
        // Claim the slot immediately so a flurry of remote beacons doesn't
        // bounce us out before our own beacon publishes.
        this.localVideoClaimedAt.set('camera', Math.floor(Date.now() / 1000));
        const cap = { maxBitrate: preset.maxBitrate, maxFramerate: preset.maxFramerate };
        for (const peer of this.room.peers.values()) {
          await peer.setLocalTrack('camera', this.camera);
          await peer.setLocalVideoCap(cap);
        }
        const sfu = this.host.sfu();
        if (sfu) await sfu.publishTrack('camera', this.camera).catch((e) => console.warn('[voice] sfu publish camera threw', e));
        // Republish beacon ASAP so other peers see our claim and don't
        // race past us.
        this.host.onVideoClaimChanged();
      }
    } else if (!on && this.camera) {
      for (const peer of this.room.peers.values()) await peer.setLocalTrack('camera', null);
      const sfu = this.host.sfu();
      if (sfu) await sfu.unpublishTrack('camera').catch(() => undefined);
      this.host.stopTrack(this.camera);
      this.camera = null;
      if (this.localVideoClaimedAt.delete('camera')) {
        this.host.onVideoClaimChanged();
      }
    }
    this.host.emitLocal();
  }

  /**
   * Flip between front ('user') and back ('environment') cameras on devices
   * that have both. No-op when the camera isn't currently on. Replaces the
   * local track in place on every mesh peer and on the SFU producer, so
   * remote viewers see the swap without renegotiation churn beyond the
   * `replaceTrack` call.
   */
  async switchCamera(): Promise<void> {
    if (!this.camera) return;
    const next: 'user' | 'environment' = this.cameraFacing === 'user' ? 'environment' : 'user';
    const quality = this.room.ui.readVideoQuality().videoQuality;
    const preset = getPreset(quality);
    const generation = this.host.generation();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { ...preset.constraints, facingMode: { exact: next } },
      });
    } catch {
      // Some devices reject `exact` even when both cameras exist; retry
      // with a soft `ideal` hint before giving up (the retry's own
      // rejection propagates).
      stream = await navigator.mediaDevices.getUserMedia({
        video: { ...preset.constraints, facingMode: next },
      });
    }
    if (!this.host.keepAcquired(stream, generation, this.camera === null)) return;
    const newTrack = stream.getVideoTracks()[0] ?? null;
    if (!newTrack) return;
    this.host.setContentHint(newTrack, 'motion');
    const oldTrack = this.camera;
    this.camera = newTrack;
    this.cameraFacing = next;
    for (const peer of this.room.peers.values()) await peer.setLocalTrack('camera', newTrack);
    const sfu = this.host.sfu();
    if (sfu) {
      await sfu.publishTrack('camera', newTrack).catch((e) => console.warn('[voice] sfu replace camera threw', e));
    }
    this.host.stopTrack(oldTrack);
    this.host.emitLocal();
  }

  async setScreenShareEnabled(on: boolean): Promise<void> {
    if (on && !this.screen) {
      // Same room-wide video-slot cap as camera; screen-share counts as
      // one slot regardless of whether screen-audio is attached.
      if (!this.canClaimVideoSlot('screen')) {
        this.room.ui.setError('screenTaken');
        throw new VoiceError('screenTaken', 'A screen is already being shared. Only one screen share is allowed.');
      }
      const generation = this.host.generation();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
      if (!this.host.keepAcquired(stream, generation, this.screen !== null)) return;
      this.screen = stream.getVideoTracks()[0] ?? null;
      this.screenAudio = stream.getAudioTracks()[0] ?? null;
      const sfu = this.host.sfu();
      if (this.screen) {
        // Screen-share is text-heavy: tell the encoder to preserve detail
        // (sharp glyphs) rather than smoothness. Pairs with the
        // 'maintain-resolution' degradationPreference set in peer.ts.
        this.host.setContentHint(this.screen, 'detail');
        this.localVideoClaimedAt.set('screen', Math.floor(Date.now() / 1000));
        for (const peer of this.room.peers.values()) await peer.setLocalTrack('screen', this.screen);
        if (sfu) await sfu.publishTrack('screen', this.screen).catch((e) => console.warn('[voice] sfu publish screen threw', e));
      }
      if (this.screenAudio) {
        // Music / system audio: let Opus encode at full quality, no AGC.
        this.host.setContentHint(this.screenAudio, 'music');
        for (const peer of this.room.peers.values()) await peer.setLocalTrack('screen-audio', this.screenAudio);
        if (sfu) await sfu.publishTrack('screen-audio', this.screenAudio).catch((e) => console.warn('[voice] sfu publish screen-audio threw', e));
      }
      // Browser-driven stop ("Stop sharing" toolbar button): clean up.
      if (this.screen) {
        this.screen.onended = () => { void this.setScreenShareEnabled(false); };
      }
      this.host.onVideoClaimChanged();
    } else if (!on) {
      // Take the tracks off `this` and detach `onended` before any await:
      // the browser's "Stop sharing" and our own toggle can race, and a
      // track whose `ended` fires on stop() would otherwise re-enter here
      // with the same track forever.
      const screen = this.screen;
      const screenAudio = this.screenAudio;
      this.screen = null;
      this.screenAudio = null;
      const sfu = this.host.sfu();
      if (screen) {
        screen.onended = null;
        for (const peer of this.room.peers.values()) await peer.setLocalTrack('screen', null);
        if (sfu) await sfu.unpublishTrack('screen').catch(() => undefined);
        this.host.stopTrack(screen);
      }
      if (screenAudio) {
        for (const peer of this.room.peers.values()) await peer.setLocalTrack('screen-audio', null);
        if (sfu) await sfu.unpublishTrack('screen-audio').catch(() => undefined);
        this.host.stopTrack(screenAudio);
      }
      if (this.localVideoClaimedAt.delete('screen')) {
        this.host.onVideoClaimChanged();
      }
    }
    this.host.emitLocal();
  }

  /** Stop and forget the camera and the screen; the mic is the host's. */
  releaseAll(): void {
    this.host.stopTrack(this.camera); this.camera = null;
    if (this.screen) this.screen.onended = null;
    this.host.stopTrack(this.screen); this.screen = null;
    this.host.stopTrack(this.screenAudio); this.screenAudio = null;
    this.localVideoClaimedAt.clear();
  }

  // ── Video-slot cap (room-wide) ─────────────────────────────────────────

  private buildVideoSlotList(): VideoSlotClaim[] {
    return buildVideoSlotList(this.host.roster(), this.room.selfPubkey, this.localVideoClaimedAt);
  }

  /** Number of video slots currently in use across the room. */
  getVideoSlotsInUse(): number {
    return cameraSlotsInUse(this.buildVideoSlotList());
  }

  getVideoSlotsAvailable(): number {
    return Math.max(0, MAX_CAMERAS - this.getVideoSlotsInUse());
  }

  private canClaimVideoSlot(kind: VideoSlotKind): boolean {
    return canClaimVideoSlot(this.buildVideoSlotList(), kind);
  }

  /**
   * Re-check the cap against the latest roster. If our local video is
   * outside the leading per-kind cap, evict it (mirrors the audio-mesh
   * cap-overflow logic in the dial loop). Triggered on every roster
   * update, so a remote claim that landed before ours pushes us out
   * within one beacon hop.
   */
  enforceVideoSlotCap(): void {
    if (this.localVideoClaimedAt.size === 0) return;
    const list = this.buildVideoSlotList();
    const winners = videoSlotWinners(list);
    if (winners.length === list.length) return;
    const winnerSet = new Set(winners.map((winner) => winner.pubkey + ':' + winner.kind));
    // For each of OUR local tracks, evict the ones that didn't make it
    // into the leading slice. Don't await: the toggle is fire-and-forget;
    // any lingering peers will see the next beacon refresh announcing the
    // dropped track.
    for (const kind of Array.from(this.localVideoClaimedAt.keys())) {
      const ourKey = this.room.selfPubkey + ':' + kind;
      if (winnerSet.has(ourKey)) continue;
      console.warn('[voice] video-slot evicted locally:', kind, '(another peer claimed it earlier)');
      if (kind === 'camera') {
        void this.setCameraEnabled(false);
      } else {
        void this.setScreenShareEnabled(false);
      }
      this.room.ui.setError(kind === 'camera' ? 'cameraEvicted' : 'screenEvicted');
    }
  }
}
