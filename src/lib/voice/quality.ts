/**
 * Video-quality presets for outbound camera/screen tracks.
 *
 * `auto` lets the encoder + adaptive loop in `stats.ts` pick the bitrate;
 * the explicit tiers cap both the resolution requested via `getUserMedia`
 * and the encoder's `maxBitrate`/`maxFramerate` via `setParameters`.
 */

export type VideoQuality = 'auto' | '1080p' | '720p' | '480p';

export const VIDEO_QUALITIES: readonly VideoQuality[] = ['auto', '1080p', '720p', '480p'];

export interface QualityPreset {
  /** `MediaTrackConstraints` overlay for `getUserMedia({ video: ... })`. */
  constraints: MediaTrackConstraints;
  /** Encoder cap. `null` means "let the bandwidth estimator decide". */
  maxBitrate: number | null;
  maxFramerate: number;
  /** Rough cap used when sending a `qualityhint` to ask peers to send less. */
  maxHeight: number | null;
}

const PRESETS: Record<VideoQuality, QualityPreset> = {
  auto: {
    // Loose hints only — matches pre-quality-controls behavior. Some mobile
    // cams reject combined width+height+frameRate "ideal" constraints and
    // fall back to a track that never produces frames.
    constraints: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    maxBitrate: null,
    maxFramerate: 30,
    maxHeight: null,
  },
  '1080p': {
    constraints: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
    },
    maxBitrate: 4_000_000,
    maxFramerate: 30,
    maxHeight: 1080,
  },
  '720p': {
    constraints: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
    maxBitrate: 2_500_000,
    maxFramerate: 30,
    maxHeight: 720,
  },
  '480p': {
    constraints: {
      width: { ideal: 854 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
    maxBitrate: 1_000_000,
    maxFramerate: 30,
    maxHeight: 480,
  },
};

export function getPreset(q: VideoQuality): QualityPreset {
  return PRESETS[q];
}

/**
 * High-quality mic constraints. We always run AEC/NS/AGC; the extra hints
 * (sampleRate / channelCount) are advisory — browsers fall back gracefully
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

/** Encoder cap for outbound mic — Opus tops out at ~128 kbps for stereo music. */
export const AUDIO_MAX_BITRATE = 128_000;
