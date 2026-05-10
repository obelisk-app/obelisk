'use client';

/**
 * Always-mounted hidden audio sink for the active voice call.
 *
 * The voice room's tile components used to render their own `<audio>`
 * elements with `srcObject` pointing at remote MediaStreams. That meant
 * audio output disappeared the moment the room unmounted — i.e. as soon
 * as the user navigated to a text channel or DM during a live call —
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
import { useEffect, useRef, useState } from 'react';
import { subscribeActiveVoiceClient } from '@/lib/voice/active-client';
import type { VoiceClient, RemoteTrack } from '@/lib/voice/client';
import { useVoiceStore } from '@/store/voice';

export default function BackgroundVoiceAudio() {
  const [client, setClient] = useState<VoiceClient | null>(null);
  const [tracks, setTracks] = useState<RemoteTrack[]>([]);

  useEffect(() => {
    return subscribeActiveVoiceClient((c) => {
      setClient(c);
      if (!c) setTracks([]);
    });
  }, []);

  useEffect(() => {
    if (!client) return;
    return client.subscribeRemoteTracks((t) => setTracks(t));
  }, [client]);

  const audible = tracks.filter((t) => t.kind === 'audio' || t.kind === 'screen-audio');

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

function BackgroundAudioElement({ pubkey, stream }: { pubkey: string; stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const isMutedForMe = useVoiceStore((s) => s.isDeafened || !!s.localMutedPubkeys[pubkey]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    // jsdom's play() returns void; guard with `?.catch` so the autoplay
    // rejection path stays a noop in tests.
    el.play()?.catch(() => { /* user gesture during join already unlocks audio in real browsers */ });
  }, [stream]);

  return <audio ref={ref} autoPlay muted={isMutedForMe} />;
}
