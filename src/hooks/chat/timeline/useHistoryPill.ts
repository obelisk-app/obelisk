'use client';

import { useEffect, useState } from 'react';

/** Loading shorter than this never shows a spinner; the pill fades over it too. */
const SETTLE_MS = 180;

/**
 * Whether the history pill is mounted, whether it is shown, and what it
 * says. A load that settles within 180ms never shows a spinner; the pill
 * stays mounted for one fade after it stops being active, still saying
 * what it last said.
 */
export function useHistoryPill(loading: boolean, reachedStart: boolean, atTop: boolean) {
  // Each stretch of `loading === true` is one epoch, counted in render, so
  // the delayed spinner can be "shown for this epoch" without a reset step.
  const [epoch, setEpoch] = useState(0);
  const [wasLoading, setWasLoading] = useState(loading);
  if (loading !== wasLoading) {
    setWasLoading(loading);
    if (loading) setEpoch((e) => e + 1);
  }
  const [shownEpoch, setShownEpoch] = useState(-1);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setShownEpoch(epoch), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [loading, epoch]);

  const visibleLoading = loading && shownEpoch === epoch;
  const active = atTop && (visibleLoading || reachedStart);

  // What the pill last said, so it fades out still saying it.
  const [lastMode, setLastMode] = useState<'loading' | 'end'>('loading');
  if (visibleLoading && lastMode !== 'loading') setLastMode('loading');
  else if (!visibleLoading && atTop && reachedStart && lastMode !== 'end') setLastMode('end');

  // Mounted while active, and for one fade after it stops being active.
  const [mounted, setMounted] = useState(active);
  if (active && !mounted) setMounted(true);
  useEffect(() => {
    if (active) return;
    const timer = setTimeout(() => setMounted(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const mode: 'loading' | 'end' = active ? (visibleLoading ? 'loading' : 'end') : lastMode;
  return { mounted, active, mode };
}
