'use client';

import { useEffect, useRef } from 'react';

/**
 * A ref for a `<video>` or `<audio>` that keeps its `srcObject` bound to
 * `stream` and nudges `play()` whenever a stream arrives. Autoplay refusals
 * are swallowed: the element carries `autoPlay` as well, this is the retry.
 */
export function useStreamRef<T extends HTMLMediaElement>(stream: MediaStream | null) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play?.()?.catch?.(() => {});
  }, [stream]);
  return ref;
}
