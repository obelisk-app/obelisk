/**
 * The capture side of a DM call: microphone, camera and screen tracks, the
 * permission-prompt races around acquiring them, and the stable per-track
 * `MediaStream`s the UI binds to. The DM-call counterpart of
 * `voice/local-media.ts`: one `Peer`, no video-slot cap, no SFU.
 *
 * Two races are guarded on every acquisition, because the browser's
 * permission prompt can resolve long after the click that opened it:
 * the call may have ended meanwhile (the track is stopped on the spot, or
 * the tab's capture indicator stays lit on a session nothing releases),
 * and another acquisition of the same kind may have won meanwhile (the
 * loser is stopped, or it stays live and unpublished with nothing left
 * holding a reference to stop it).
 */
import type { Peer } from '@/services/voice/peer';
import { getPreset, MIC_CONSTRAINTS } from '@/services/voice/quality';

export interface DmLocalMediaDeps {
  /** A video call: the camera is acquired with the microphone. */
  video: boolean;
  /** The call ended; whatever a prompt grants from now on is stopped. */
  ended(): boolean;
  /** The live `Peer` to publish on, when there is one. */
  peer(): Peer | null;
  /** Local track state changed; the session re-emits its media state. */
  onChanged(): void;
  /** Test seams. */
  getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>;
  getDisplayMedia?: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
}

export interface DmLocalMediaSnapshot {
  micOn: boolean;
  cameraOn: boolean;
  screenOn: boolean;
  localVideo: MediaStream | null;
  localScreen: MediaStream | null;
}

const CAMERA_PRESET = getPreset('720p');
const CAMERA_CAP = { maxBitrate: CAMERA_PRESET.maxBitrate, maxFramerate: CAMERA_PRESET.maxFramerate };

export class DmLocalMedia {
  private mic: MediaStreamTrack | null = null;
  private cam: MediaStreamTrack | null = null;
  private screen: MediaStreamTrack | null = null;
  private screenAudio: MediaStreamTrack | null = null;
  /** The user's mute choice; applied to the mic track whenever one exists. */
  private micOn = true;
  private facing: 'user' | 'environment' = 'user';
  /** One stable `MediaStream` per local track, so a `<video>` isn't re-bound on every emit. */
  private readonly localStreams = new Map<MediaStreamTrack, MediaStream>();

  constructor(private readonly deps: DmLocalMediaDeps) {}

  snapshot(): DmLocalMediaSnapshot {
    return {
      micOn: this.micOn,
      cameraOn: this.cam !== null,
      screenOn: this.screen !== null,
      localVideo: this.localStream(this.cam),
      localScreen: this.localStream(this.screen),
    };
  }

  /** Acquire the mic (and the camera for a video call). Before `connect`. */
  async acquire(): Promise<void> {
    if (this.deps.ended()) return;
    const stream = await this.gum({ audio: MIC_CONSTRAINTS });
    if (!this.keepGranted(stream, this.mic !== null)) return;
    this.mic = stream.getAudioTracks()[0] ?? null;
    // The user may have muted while the prompt was open; a track that
    // ignores that is a hot microphone behind a muted button.
    if (this.mic) this.mic.enabled = this.micOn;
    if (this.deps.video) {
      try {
        const track = await this.captureCamera(this.facing);
        if (track) await this.adoptCamera(track);
      } catch (e) {
        // A call without a camera is still a call.
        console.warn('[dm-call] camera unavailable', e);
      }
    }
    if (this.deps.ended()) return; // the camera prompt outlived the call; both tracks are stopped
    this.deps.onChanged();
  }

  /** Push every local track, with the camera cap, to a freshly built `Peer`. */
  async attachTo(peer: Peer): Promise<void> {
    if (this.mic) await peer.setLocalTrack('audio', this.mic);
    if (this.cam) {
      await peer.setLocalTrack('camera', this.cam);
      await peer.setLocalVideoCap(CAMERA_CAP);
    }
    if (this.screen) await peer.setLocalTrack('screen', this.screen);
    if (this.screenAudio) await peer.setLocalTrack('screen-audio', this.screenAudio);
  }

  setMic(on: boolean): void {
    this.micOn = on;
    if (this.mic) this.mic.enabled = on;
    this.deps.onChanged();
  }

  async setCamera(on: boolean): Promise<void> {
    if (this.deps.ended()) return;
    if (on && !this.cam) {
      const track = await this.captureCamera(this.facing);
      if (!track) return; // ended meanwhile; captureCamera stopped it
      try { await this.adoptCamera(track); } finally { this.deps.onChanged(); }
    } else if (!on && this.cam) {
      // Off the instance before the first await, so a second toggle (or a
      // concurrent on) sees the camera as already gone.
      const cam = this.cam;
      this.cam = null;
      try { await this.deps.peer()?.setLocalTrack('camera', null); }
      finally { cam.stop(); this.deps.onChanged(); }
    } else {
      this.deps.onChanged();
    }
  }

  /** Front / back camera on phones. No-op while the camera is off. */
  async flipCamera(): Promise<void> {
    if (this.deps.ended() || !this.cam) return;
    const old = this.cam;
    const next: 'user' | 'environment' = this.facing === 'user' ? 'environment' : 'user';
    const track = await this.captureCamera(next);
    if (!track) return; // ended meanwhile; releaseAll() stopped `old`
    if (this.cam !== old) {
      // Another flip (or a camera-off) won while the prompt was open.
      track.stop();
      return;
    }
    this.cam = track;
    this.facing = next;
    try {
      const peer = this.deps.peer();
      if (peer) await peer.setLocalTrack('camera', track);
    } finally {
      old.stop();
      this.deps.onChanged();
    }
  }

  async setScreenShare(on: boolean): Promise<void> {
    if (this.deps.ended()) return;
    if (on && !this.screen) {
      const gdm = this.deps.getDisplayMedia ?? ((c) => navigator.mediaDevices.getDisplayMedia(c));
      const stream = await gdm({ video: true, audio: true });
      if (!this.keepGranted(stream, this.screen !== null)) return;
      this.screen = stream.getVideoTracks()[0] ?? null;
      this.screenAudio = stream.getAudioTracks()[0] ?? null;
      // The browser's own "Stop sharing" bar ends the track without us.
      this.screen?.addEventListener('ended', () => { void this.setScreenShare(false); }, { once: true });
      try {
        const peer = this.deps.peer();
        if (peer && this.screen) await peer.setLocalTrack('screen', this.screen);
        if (peer && this.screenAudio) await peer.setLocalTrack('screen-audio', this.screenAudio);
      } finally {
        this.deps.onChanged();
      }
    } else if (!on && this.screen) {
      // Off the instance before the first await: the browser's "Stop
      // sharing" and our own toggle can race through here together.
      const screen = this.screen;
      const screenAudio = this.screenAudio;
      this.screen = null;
      this.screenAudio = null;
      try {
        const peer = this.deps.peer();
        await peer?.setLocalTrack('screen', null);
        if (screenAudio) await peer?.setLocalTrack('screen-audio', null);
      } finally {
        screen.stop();
        screenAudio?.stop();
        this.deps.onChanged();
      }
    } else {
      this.deps.onChanged();
    }
  }

  /**
   * Stop and forget every local track. Synchronous; never throws. The
   * first thing `end()` does, before anything that can throw.
   */
  releaseAll(): void {
    for (const t of [this.mic, this.cam, this.screen, this.screenAudio]) t?.stop();
    this.mic = this.cam = this.screen = this.screenAudio = null;
    this.localStreams.clear();
  }

  private gum(c: MediaStreamConstraints): Promise<MediaStream> {
    return (this.deps.getUserMedia ?? ((x) => navigator.mediaDevices.getUserMedia(x)))(c);
  }

  /**
   * A prompt resolved after the call ended, or after another acquisition
   * of the same kind won: stop what the browser handed us so the capture
   * indicator goes dark, and report whether the caller may keep it.
   */
  private keepGranted(stream: MediaStream, alreadyHeld: boolean): boolean {
    if (!this.deps.ended() && !alreadyHeld) return true;
    for (const t of stream.getTracks()) t.stop();
    return false;
  }

  /** The camera track, or null when the call ended while the prompt was open. */
  private async captureCamera(facing: 'user' | 'environment'): Promise<MediaStreamTrack | null> {
    const stream = await this.gum({ video: { ...CAMERA_PRESET.constraints, facingMode: facing } });
    if (!this.keepGranted(stream, false)) return null;
    const track = stream.getVideoTracks()[0] ?? null;
    if (track) {
      // Per spec an unsupported hint is ignored, not thrown; the guard is
      // for engines predating the property as a setter.
      try { track.contentHint = 'motion'; } catch { /* older browsers */ }
    }
    return track;
  }

  /** Take a freshly granted camera track, unless one arrived first. */
  private async adoptCamera(track: MediaStreamTrack): Promise<void> {
    if (this.cam) {
      track.stop();
      return;
    }
    this.cam = track;
    const peer = this.deps.peer();
    if (peer) {
      await peer.setLocalTrack('camera', track);
      await peer.setLocalVideoCap(CAMERA_CAP);
    }
  }

  private localStream(track: MediaStreamTrack | null): MediaStream | null {
    if (!track) return null;
    let stream = this.localStreams.get(track);
    if (!stream) {
      for (const t of this.localStreams.keys()) if (t.readyState === 'ended') this.localStreams.delete(t);
      stream = new MediaStream([track]);
      this.localStreams.set(track, stream);
    }
    return stream;
  }
}
