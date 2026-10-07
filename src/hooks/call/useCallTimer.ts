'use client';

import { useEffect, useState } from 'react';
import { formatElapsed } from '@/utils/format/format-elapsed';

/** The time since `since`, as the call view shows it, ticking every second. */
export function useCallTimer(since: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return formatElapsed(now - since);
}
