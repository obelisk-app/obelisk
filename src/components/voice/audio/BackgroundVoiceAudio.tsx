'use client';

/**
 * Always-mounted hidden audio sink for the active voice call.
 *
 * The voice room's tile components used to render their own `<audio>`
 * elements with `srcObject` pointing at remote MediaStreams. That meant
 * audio output disappeared the moment the room unmounted - i.e. as soon
 * as the user navigated to a text channel or DM during a live call -
 * even though the underlying `VoiceClient` (and its WebRTC PCs) stayed
 * alive. This component plays the audio + screen-audio remote tracks
 * regardless of which screen is on top, so background calls actually
 * stay audible.
 *
 * It owns a single `<audio>` per remote track id, bound to that track's
 * `MediaStream`. Per-pubkey local mute is honored via the voice store's
 * `localMutedPubkeys`. Global deafen is handled at the track level
 * inside `VoiceClient.setDeafenEnabled` (which disables the underlying
 * MediaStreamTracks), so no extra wiring is needed here.
 */
import { useBackgroundVoiceAudio } from '@/hooks/voice/audio/useBackgroundVoiceAudio';
import BackgroundAudioElement from './BackgroundAudioElement';

export default function BackgroundVoiceAudio() {
  const audible = useBackgroundVoiceAudio();

  return (
    <div
      aria-hidden
      data-testid="background-voice-audio"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {audible.map((t) => (
        <BackgroundAudioElement key={t.trackId} pubkey={t.pubkey} stream={t.stream} />
      ))}
    </div>
  );
}
