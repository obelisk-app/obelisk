/**
 * The joined room's grids, as class lists, and the small rules the stage
 * and its tiles share. Pure; `useStageArea` hands them to the markup.
 */
import type { TracksByPubkey } from '@/utils/voice/stage-layout';

/** The camera grid's columns for `n` cameras (one camera fills the area on its own). */
export function videoGridClass(n: number): string {
  if (n === 2) return 'grid-cols-1 sm:grid-cols-2';
  if (n === 3) return 'grid-cols-1 sm:grid-cols-3';
  if (n === 4) return 'grid-cols-2';
  return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
}

/** The audio grid's columns for `n` audio-only participants, when nobody has a camera on. */
export function audioGridClass(n: number): string {
  if (n === 1) return 'grid-cols-1';
  if (n === 2) return 'grid-cols-2';
  if (n <= 4) return 'grid-cols-2 sm:grid-cols-2';
  return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';
}

/** The camera stream a tile shows: my own preview for me, else the remote camera track, else none. */
export function cameraStreamFor(
  pubkey: string,
  selfPubkey: string,
  localCamStream: MediaStream | null,
  tracks: TracksByPubkey,
): MediaStream | null {
  return pubkey === selfPubkey ? localCamStream : (tracks.get(pubkey)?.camera?.stream ?? null);
}

/** Pinning the pinned person unpins; pinning anyone else pins them. */
export function togglePinned(current: string | null, pubkey: string): string | null {
  return current === pubkey ? null : pubkey;
}
