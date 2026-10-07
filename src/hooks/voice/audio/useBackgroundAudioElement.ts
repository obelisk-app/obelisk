import { useEffect, useRef } from 'react';
import { useVoiceStore } from '@/store/voice';

/**
 * One background `<audio>`: bound to `stream` and nudged to play when it
 * arrives, muted while deafened or while this person is muted for me.
 */
export function useBackgroundAudioElement(pubkey: string, stream: MediaStream) {
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

  return { ref, isMutedForMe };
}
