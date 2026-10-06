/**
 * What a `Peer` knows about the tracks the remote sends it: the voice kind
 * and origin each track id was announced with (`trackinfo` arrives before
 * the track), and the grace period a muted remote video gets before it is
 * reported ended.
 */
import type { VoiceTrackKind } from './types';
import type { PeerEvents } from './peer-types';

export const REMOTE_VIDEO_MUTE_GRACE_MS = 2500;

export class PeerRemoteTracks {
  private readonly kinds = new Map<string, VoiceTrackKind>();
  private readonly origins = new Map<string, string>();
  private readonly videoMuteTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly events: Pick<PeerEvents, 'onRemoteTrack' | 'onRemoteTrackEnded'>) {}

  /** A `trackinfo` signal named the kind (and origin) of an incoming track id. */
  announce(trackId: string, kind: VoiceTrackKind, originPubkey?: string): void {
    this.kinds.set(trackId, kind);
    if (originPubkey) this.origins.set(trackId, originPubkey);
  }

  handleTrack(track: MediaStreamTrack, stream: MediaStream): void {
    const kind = this.kinds.get(track.id) ?? (track.kind === 'audio' ? 'audio' : 'camera');
    this.events.onRemoteTrack(track, stream, kind, this.origins.get(track.id));
    const ended = () => {
      const timer = this.videoMuteTimers.get(track.id);
      if (timer) clearTimeout(timer);
      this.videoMuteTimers.delete(track.id);
      this.events.onRemoteTrackEnded(track.id);
    };
    track.addEventListener('ended', ended, { once: true });
    if (kind === 'camera' || kind === 'screen') {
      track.addEventListener('mute', () => {
        const previous = this.videoMuteTimers.get(track.id);
        if (previous) clearTimeout(previous);
        this.videoMuteTimers.set(track.id, setTimeout(ended, REMOTE_VIDEO_MUTE_GRACE_MS));
      });
      track.addEventListener('unmute', () => {
        const timer = this.videoMuteTimers.get(track.id);
        if (timer) clearTimeout(timer);
        this.videoMuteTimers.delete(track.id);
      });
    }
  }

  /** Drop the pending mute-grace timers. */
  stop(): void {
    for (const timer of this.videoMuteTimers.values()) clearTimeout(timer);
    this.videoMuteTimers.clear();
  }
}
