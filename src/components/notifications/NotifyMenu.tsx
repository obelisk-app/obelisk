'use client';

import { useEffect, useId, useState } from 'react';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';
import type { ScopeRef } from '@/lib/server/scope-chain';
import { readPermission, requestPermission, type PermissionState } from '@/lib/notifications/permission';

interface NotifyMenuProps {
  scope: ScopeRef;
  title: string; // display name without prefix; the # is added for channel scopes
  onClose: () => void;
}

const DURATIONS: Array<{ label: string; minutes: number | 'forever' }> = [
  { label: '15 minutes', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '8 hours', minutes: 60 * 8 },
  { label: '24 hours', minutes: 60 * 24 },
  { label: 'Until I turn it back on', minutes: 'forever' },
];

const FOREVER_DATE = '9999-12-31T23:59:59.999Z';

function durationToTimestamp(minutes: number | 'forever'): string {
  if (minutes === 'forever') return FOREVER_DATE;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function NotifyMenu({ scope, title, onClose }: NotifyMenuProps) {
  const prefs = useNotificationPrefsStore((s) => s.prefs);
  const setPref = useNotificationPrefsStore((s) => s.setPref);
  const resetPref = useNotificationPrefsStore((s) => s.resetPref);
  const current = prefs.find((p) => p.scopeType === scope.type && p.scopeId === scope.id);

  const headerPrefix = scope.type === 'channel' ? '#' : '';
  const currentLevel = current?.notifyLevel ?? null;

  const uid = useId();
  const lvlName = `lvl-${uid}`;
  const muteName = `mute-${uid}`;

  const [perm, setPerm] = useState<PermissionState>('unsupported');
  useEffect(() => { setPerm(readPermission()); }, []);
  const handleEnable = async () => {
    const next = await requestPermission();
    setPerm(next);
  };

  const handleLevel = (level: 'all' | 'mentions' | 'nothing' | null) => {
    void setPref(scope, { notifyLevel: level }).catch(() => {});
  };

  const handleMute = (minutes: number | 'forever') => {
    void setPref(scope, { mutedUntil: durationToTimestamp(minutes) }).catch(() => {});
  };

  const handleReset = () => {
    void resetPref(scope).catch(() => {});
    onClose();
  };

  return (
    <div className="lc-card p-4 w-72" role="dialog" aria-label="Notification settings">
      <div className="text-sm font-medium mb-3 text-lc-white">
        Notifications for {headerPrefix}{title}
      </div>

      {perm === 'default' && (
        <div className="text-xs bg-lc-dark border border-lc-border p-2 rounded mb-3 flex items-center gap-2">
          <span className="flex-1 text-lc-muted">Browser notifications aren&apos;t enabled</span>
          <button className="lc-pill-primary text-xs" onClick={handleEnable}>Enable</button>
        </div>
      )}

      <fieldset className="mb-4">
        <legend className="sr-only">Notification level</legend>
        <label className="flex items-center gap-2 py-1 cursor-pointer text-lc-white">
          <input type="radio" name={lvlName} checked={currentLevel === null} onChange={() => handleLevel(null)} />
          <span>Default (mentions only)</span>
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer text-lc-white">
          <input type="radio" name={lvlName} checked={currentLevel === 'all'} onChange={() => handleLevel('all')} />
          <span>All messages</span>
        </label>
        <label className="flex items-center gap-2 py-1 cursor-pointer text-lc-white">
          <input type="radio" name={lvlName} checked={currentLevel === 'nothing'} onChange={() => handleLevel('nothing')} />
          <span>Nothing</span>
        </label>
      </fieldset>

      <div className="border-t border-lc-border my-2" />

      <fieldset className="mb-4">
        <legend className="text-xs uppercase tracking-wide text-lc-muted mb-1">Mute for</legend>
        {DURATIONS.map((d) => (
          <label key={d.label} className="flex items-center gap-2 py-1 cursor-pointer text-lc-white">
            <input type="radio" name={muteName} onChange={() => handleMute(d.minutes)} onClick={() => handleMute(d.minutes)} />
            <span>{d.label}</span>
          </label>
        ))}
      </fieldset>

      <div className="border-t border-lc-border my-2" />

      <button className="lc-pill-secondary text-sm w-full" onClick={handleReset}>
        Reset to default
      </button>
    </div>
  );
}
