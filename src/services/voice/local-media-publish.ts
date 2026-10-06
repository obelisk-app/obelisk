/**
 * Pushing the local capture to the people who hear it: every track plus
 * the quality contract to a new mesh peer, every track to a freshly
 * started SFU client, and the two quality changes a user can make
 * mid-call.
 */
import type { Peer } from './peer';
import type { SfuClient } from './sfu-client';
import type { RoomState } from './room-state';
import type { VoiceQualityHint } from './types';
import { getPreset, type VideoQuality } from './quality';

/** The slice of `SfuClient` local media publishes through. */
export type SfuPublisher = Pick<SfuClient, 'publishTrack' | 'unpublishTrack'>;

/** What is captured right now; `null` where nothing is. */
export interface CapturedTracks {
  mic: MediaStreamTrack | null;
  camera: MediaStreamTrack | null;
  screen: MediaStreamTrack | null;
  screenAudio: MediaStreamTrack | null;
}

export function qualityHintFromPreset(preset: { maxBitrate: number | null; maxFramerate: number; maxHeight: number | null }): VoiceQualityHint {
  return {
    maxHeight: preset.maxHeight,
    maxFramerate: preset.maxFramerate,
    maxBitrate: preset.maxBitrate,
  };
}

/** Push every local track, plus the quality contract, to a new mesh peer. */
export async function attachAllTo(tracks: CapturedTracks, room: RoomState, peer: Peer): Promise<void> {
  if (tracks.mic) await peer.setLocalTrack('audio', tracks.mic);
  if (tracks.camera) await peer.setLocalTrack('camera', tracks.camera);
  if (tracks.screen) await peer.setLocalTrack('screen', tracks.screen);
  if (tracks.screenAudio) await peer.setLocalTrack('screen-audio', tracks.screenAudio);
  // Push the user-chosen outbound cap and our receive hint so a peer who
  // joins mid-call inherits the same quality contract as existing peers.
  const { videoQuality, receivedVideoQuality } = room.ui.readVideoQuality();
  const localPreset = getPreset(videoQuality);
  await peer.setLocalVideoCap({ maxBitrate: localPreset.maxBitrate, maxFramerate: localPreset.maxFramerate });
  if (receivedVideoQuality !== 'auto') {
    const inbound = getPreset(receivedVideoQuality);
    await peer.sendQualityHint(qualityHintFromPreset(inbound));
  }
}

/** Push every local track to a freshly started SFU client. */
export async function publishAllTo(tracks: CapturedTracks, client: SfuPublisher): Promise<void> {
  if (tracks.mic) await client.publishTrack('audio', tracks.mic).catch((e) => console.warn('[voice] publish mic threw', e));
  if (tracks.camera) await client.publishTrack('camera', tracks.camera).catch((e) => console.warn('[voice] publish cam threw', e));
  if (tracks.screen) await client.publishTrack('screen', tracks.screen).catch((e) => console.warn('[voice] publish screen threw', e));
  if (tracks.screenAudio) await client.publishTrack('screen-audio', tracks.screenAudio).catch((e) => console.warn('[voice] publish screen-audio threw', e));
}

/** User changed their outbound camera quality. Re-apply the constraints
 *  and update encoder caps on every peer. */
export async function applyVideoQuality(camera: MediaStreamTrack | null, room: RoomState, q: VideoQuality): Promise<void> {
  const preset = getPreset(q);
  const cap = { maxBitrate: preset.maxBitrate, maxFramerate: preset.maxFramerate };
  if (camera) {
    try {
      await camera.applyConstraints(preset.constraints);
    } catch (e) {
      console.warn('[voice] applyConstraints failed, will re-acquire', e);
    }
  }
  for (const peer of room.peers.values()) {
    await peer.setLocalVideoCap(cap);
  }
}

/** User changed their incoming-quality preference. Broadcast a qualityhint
 *  to every peer so they cap their outbound video to us. */
export async function broadcastReceivedQuality(room: RoomState, q: VideoQuality): Promise<void> {
  const hint = qualityHintFromPreset(getPreset(q));
  for (const peer of room.peers.values()) {
    await peer.sendQualityHint(hint);
  }
}
