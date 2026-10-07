/**
 * Voice: quality. Values the code in `services/voice/quality.ts` reads, kept
 * here so every reader imports the one copy.
 */

import type { VideoQuality } from '@/services/voice/quality';

export const VIDEO_QUALITIES: readonly VideoQuality[] = [
  'auto', '1080p60', '1080p', '720p60', '720p', '480p',
];

/**
 * High-quality mic constraints. We always run AEC/NS/AGC; the extra hints
 * (sampleRate / channelCount) are advisory; browsers fall back gracefully
 * if the hardware can't honor them.
 */
export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  // sampleRate/channelCount hints used to be here but real devices (iOS
  // Safari, some Android) silently failed getUserMedia when channelCount:2
  // hit a mono mic, killing the call. Encoder bitrate is still capped via
  // setParameters(AUDIO_MAX_BITRATE) on the sender.
};

/**
 * Encoder cap for outbound mic. Bumped from 128 kbps → 256 kbps so voice
 * stays crisp even when there's incidental music or ambient detail in the
 * background; Opus tops out at ~256 kbps for stereo material and the
 * extra bandwidth is negligible vs the video budget.
 */
export const AUDIO_MAX_BITRATE = 256_000;
