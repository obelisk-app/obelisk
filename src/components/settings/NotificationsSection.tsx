'use client';

import { useEffect, useState } from 'react';
import {
  readPermission,
  requestPermission,
  type PermissionState,
} from '@/lib/notifications/permission';
import { useNotificationPrefsStore } from '@/store/notificationPrefs';

const SOUND_KEY = 'obelisk:notif-sound-enabled';

function readSound(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(SOUND_KEY) !== 'false';
}

export default function NotificationsSection() {
  const [perm, setPerm] = useState<PermissionState>('unsupported');
  const [sound, setSound] = useState(true);
  const prefs = useNotificationPrefsStore((s) => s.prefs);
  const resetPref = useNotificationPrefsStore((s) => s.resetPref);

  useEffect(() => {
    setPerm(readPermission());
    setSound(readSound());
  }, []);

  const handleEnable = async () => {
    const next = await requestPermission();
    setPerm(next);
  };

  const handleSoundToggle = () => {
    const next = !sound;
    setSound(next);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SOUND_KEY, next ? 'true' : 'false');
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-medium mb-2 text-lc-white">Browser notifications</h3>
        {perm === 'unsupported' && <p className="text-lc-muted text-sm">Your browser doesn&apos;t support notifications.</p>}
        {perm === 'default' && (
          <button className="lc-pill-primary" onClick={handleEnable}>Enable browser notifications</button>
        )}
        {perm === 'granted' && <p className="text-lc-green text-sm">Enabled — you&apos;ll get OS notifications for mentions and DMs.</p>}
        {perm === 'denied' && (
          <p className="text-lc-muted text-sm">Blocked by your browser. Re-enable in your browser&apos;s site settings, then reload.</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium mb-2 text-lc-white">Sound</h3>
        <label className="flex items-center gap-2 cursor-pointer text-lc-white text-sm">
          <input type="checkbox" checked={sound} onChange={handleSoundToggle} />
          <span>Play a sound for new mentions and DMs</span>
        </label>
      </section>

      <section>
        <h3 className="text-sm font-medium mb-2 text-lc-white">Channel & server overrides</h3>
        {prefs.length === 0 && <p className="text-lc-muted text-sm">No overrides — every channel uses the default.</p>}
        {prefs.length > 0 && (
          <table className="w-full text-sm text-lc-white">
            <thead>
              <tr className="text-left text-lc-muted">
                <th className="py-1 font-normal">Scope</th>
                <th className="font-normal">Level</th>
                <th className="font-normal">Muted until</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prefs.map((p) => (
                <tr key={p.id} className="border-t border-lc-border">
                  <td className="py-1">{p.scopeType}:{p.scopeId.slice(0, 12)}…</td>
                  <td>{p.notifyLevel ?? '—'}</td>
                  <td>{p.mutedUntil ? new Date(p.mutedUntil).toLocaleString() : '—'}</td>
                  <td>
                    <button
                      className="lc-pill-secondary text-xs"
                      onClick={() => resetPref({ type: p.scopeType as 'channel' | 'server' | 'dm', id: p.scopeId })}
                    >
                      Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
