import { useState, useEffect } from 'react';
import type { AdminServerOption } from '@/components/admin/ServerPicker';

interface InstanceSettingsPanelProps {
  servers: AdminServerOption[];
}

export default function InstanceSettingsPanel({ servers }: InstanceSettingsPanelProps) {
  const [defaultServerId, setDefaultServerId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/instance/settings')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load settings');
        return res.json();
      })
      .then((data) => {
        if (data.settings?.defaultServerId) {
          setDefaultServerId(data.settings.defaultServerId);
        }
      })
      .catch((err) => {
        console.error('Error fetching instance settings:', err);
      });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/admin/instance/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultServerId: defaultServerId || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save settings');
      }
      setSuccessMsg('Settings saved successfully');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mb-8 rounded-xl border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-purple-500/20 bg-purple-500/10 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-purple-300">Global Instance Settings</h2>
          <p className="text-xs text-purple-300/70 mt-0.5">
            Settings that affect the entire Obelisk instance
          </p>
        </div>
      </div>
      <div className="p-5">
        <div className="max-w-md">
          <label className="block text-sm font-medium text-lc-white mb-1.5">
            Default Public Server
          </label>
          <p className="text-xs text-lc-muted mb-3">
            Brand new users with 0 server memberships will be automatically joined to this server upon logging in.
            Set up channels in this server as read-only to use it as an announcements board.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={defaultServerId}
              onChange={(e) => setDefaultServerId(e.target.value)}
              className="flex-1 px-3 py-2 bg-lc-black border border-lc-border rounded-lg text-sm text-lc-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              <option value="">None (Disabled)</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="lc-pill-primary px-4 py-2 text-sm whitespace-nowrap bg-purple-500 text-white hover:bg-purple-600 border-none disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
          
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          {successMsg && <p className="text-xs text-green-400 mt-2">{successMsg}</p>}
        </div>
      </div>
    </div>
  );
}
