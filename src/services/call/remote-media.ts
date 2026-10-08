/**
 * The other side's media in a DM call: one stream per track kind, and the
 * single audio stream that the mic and a shared screen's audio play through.
 * Owned by `DmCallSession`, which emits after every change.
 */
import type { VoiceTrackKind } from '@/types/voice/protocol';

export interface DmRemoteMediaSnapshot {
  remoteAudio: MediaStream | null;
  remoteVideo: MediaStream | null;
  remoteScreen: MediaStream | null;
}

export class DmRemoteMedia {
  private remote: Partial<Record<VoiceTrackKind, MediaStream>> = {};
  private remoteTrackKind = new Map<string, VoiceTrackKind>();
  private remoteAudioStream: MediaStream | null = null;

  add(track: MediaStreamTrack, kind: VoiceTrackKind): void {
    this.remoteTrackKind.set(track.id, kind);
    this.remote[kind] = new MediaStream([track]);
  }

  /** Forget an ended track. Returns false when it was never ours (no change). */
  remove(trackId: string): boolean {
    const kind = this.remoteTrackKind.get(trackId);
    if (!kind) return false;
    this.remoteTrackKind.delete(trackId);
    if (this.remote[kind]?.getTracks().some((t) => t.id === trackId)) delete this.remote[kind];
    return true;
  }

  clear(): void {
    this.remote = {};
    this.remoteTrackKind.clear();
  }

  snapshot(): DmRemoteMediaSnapshot {
    // Mic and shared-screen audio play through one element.
    const audioTracks = [...(this.remote.audio?.getTracks() ?? []), ...(this.remote['screen-audio']?.getTracks() ?? [])];
    const prev = this.remoteAudioStream?.getTracks() ?? [];
    if (audioTracks.length === 0) this.remoteAudioStream = null;
    else if (prev.length !== audioTracks.length || prev.some((t, i) => t !== audioTracks[i])) {
      this.remoteAudioStream = new MediaStream(audioTracks);
    }
    return {
      remoteAudio: this.remoteAudioStream,
      remoteVideo: this.remote.camera ?? null,
      remoteScreen: this.remote.screen ?? null,
    };
  }
}
