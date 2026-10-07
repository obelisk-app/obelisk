/**
 * The encoder caps a `Peer` puts on its outbound senders: the user's own
 * video quality preset meeting the remote's `qualityhint` at the lower of
 * the two, and the fixed Opus ceiling for audio.
 */
import type { VoiceQualityHint } from './types';
import { AUDIO_MAX_BITRATE } from '@/constants/voice/quality';

export interface VideoCap {
  maxBitrate: number | null;
  maxFramerate: number;
}

function senderFor(pc: RTCPeerConnection, track: MediaStreamTrack): RTCRtpSender | undefined {
  return pc.getSenders().find((candidate) => candidate.track === track);
}

export async function applyVideoSenderParams(
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  kind: 'camera' | 'screen',
  localCap: VideoCap | null,
  inboundCap: VoiceQualityHint | null,
): Promise<void> {
  const sender = senderFor(pc, track);
  if (!sender) return;
  const localBitrate = localCap?.maxBitrate ?? null;
  const remoteBitrate = inboundCap?.maxBitrate ?? null;
  const localFps = localCap?.maxFramerate ?? null;
  const remoteFps = inboundCap?.maxFramerate ?? null;
  const maxBitrate = localBitrate == null ? remoteBitrate
    : remoteBitrate == null ? localBitrate
    : Math.min(localBitrate, remoteBitrate);
  const maxFramerate = localFps == null ? remoteFps
    : remoteFps == null ? localFps
    : Math.min(localFps, remoteFps);
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    if (maxBitrate != null) params.encodings[0].maxBitrate = maxBitrate;
    else delete params.encodings[0].maxBitrate;
    if (maxFramerate != null) params.encodings[0].maxFramerate = maxFramerate;
    else delete params.encodings[0].maxFramerate;
    params.degradationPreference = kind === 'camera' ? 'maintain-framerate' : 'maintain-resolution';
    await sender.setParameters(params);
  } catch (error) {
    console.warn('[voice] video setParameters failed', error);
  }
}

export async function applyAudioSenderParams(pc: RTCPeerConnection, track: MediaStreamTrack): Promise<void> {
  const sender = senderFor(pc, track);
  if (!sender) return;
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = AUDIO_MAX_BITRATE;
    await sender.setParameters(params);
  } catch (error) {
    console.warn('[voice] audio setParameters failed', error);
  }
}
