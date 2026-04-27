'use client';

import { useEffect, useState } from 'react';
import {
  readPermission,
  requestPermission,
  isSoftPromptEligible,
  isPermanentlyDismissed,
  setPermanentlyDismissed,
  type PermissionState,
} from '@/lib/notifications/permission';

export function SoftPromptBanner() {
  const [perm, setPerm] = useState<PermissionState>('unsupported');
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [sessionStartedAt] = useState(() => Date.now());

  useEffect(() => {
    setPerm(readPermission());
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  const eligible = isSoftPromptEligible({
    permission: perm,
    sessionStartedAt,
    now,
    sessionDismissed,
    permanentlyDismissed: isPermanentlyDismissed(),
  });

  if (!eligible) return null;

  const handleEnable = async () => {
    const next = await requestPermission();
    setPerm(next);
  };

  const handleNeverAsk = () => {
    setPermanentlyDismissed();
    setSessionDismissed(true);
  };

  return (
    <div
      className="lc-card flex items-center gap-3 px-4 py-2 mx-4 my-2 border border-lc-border text-sm text-lc-white"
      role="status"
    >
      <span className="flex-1">
        Get notified about mentions and DMs even when Obelisk isn&apos;t focused.
      </span>
      <button className="lc-pill-primary text-xs" onClick={handleEnable}>Enable</button>
      <button className="lc-pill-secondary text-xs" onClick={() => setSessionDismissed(true)}>Not now</button>
      <button
        className="text-xs text-lc-muted hover:text-lc-white"
        onClick={handleNeverAsk}
      >
        Don&apos;t ask again
      </button>
    </div>
  );
}
