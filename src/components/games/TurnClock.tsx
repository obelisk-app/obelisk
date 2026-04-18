'use client';

import { useEffect, useState } from 'react';

export default function TurnClock({ deadline }: { deadline: string | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return (
    <span className={`font-mono text-xs ${secs <= 5 ? 'text-red-400' : 'text-lc-muted'}`}>
      0:{secs.toString().padStart(2, '0')}
    </span>
  );
}
