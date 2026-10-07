import type { RemoteTrack } from '@/services/voice/client';

/** The remote tracks that make sound: voices and screen audio, never video. */
export function audibleTracks(tracks: readonly RemoteTrack[]): RemoteTrack[] {
  return tracks.filter((t) => t.kind === 'audio' || t.kind === 'screen-audio');
}
