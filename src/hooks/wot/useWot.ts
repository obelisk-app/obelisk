'use client';

/** React views of the Web-of-Trust engine and its settings store. */
import { useEffect, useState } from 'react';
import { useWotStore, wotEngine } from '@/services/wot';

export function useWotEnabled(): boolean {
  return useWotStore((s) => s.enabled && s.status === 'configured');
}

export function useWotStatus() {
  return useWotStore((s) => s.status);
}

/**
 * Distance hop count for `pubkey`, or `null` when unresolved / out of WoT.
 * Re-renders whenever the engine emits `verdicts-changed`.
 */
export function useWotDistance(pubkey: string | null): number | null {
  const [, force] = useState(0);
  useEffect(() => {
    return wotEngine.on('verdicts-changed', () => force((n) => n + 1));
  }, []);
  if (!pubkey) return null;
  return wotEngine.getDistance(pubkey);
}

/**
 * Best (minimum) distance across an iterable of pubkeys, or `null` when
 * none of them have a resolved-allow verdict. Used by the channel rail to
 * color a group by its closest principal.
 */
export function useBestWotDistance(pubkeys: ReadonlyArray<string>): number | null {
  const [, force] = useState(0);
  useEffect(() => {
    return wotEngine.on('verdicts-changed', () => force((n) => n + 1));
  }, []);
  let best: number | null = null;
  for (const pk of pubkeys) {
    const d = wotEngine.getDistance(pk);
    if (d === null) continue;
    if (best === null || d < best) best = d;
  }
  return best;
}
