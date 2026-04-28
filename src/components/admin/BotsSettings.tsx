'use client';

import { useCallback, useEffect, useState } from 'react';

interface BotRow {
  type: string;
  defaultName: string;
  defaultAvatar: string;
  intervalMs: number;
  id: string | null;
  enabled: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  lastValue: string | null;
  lastFetchAt: string | null;
}

interface BotsSettingsProps {
  serverId: string;
}

export default function BotsSettings({ serverId }: BotsSettingsProps) {
  const [bots, setBots] = useState<BotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [refreshingType, setRefreshingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/server/bots?serverId=${encodeURIComponent(serverId)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setBots(data.bots ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (row: BotRow, patch: Partial<BotRow>) => {
    setSavingType(row.type);
    setError(null);
    try {
      const next = { ...row, ...patch };
      const res = await fetch(
        `/api/admin/server/bots?serverId=${encodeURIComponent(serverId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: row.type,
            enabled: next.enabled,
            displayName: next.displayName || null,
            avatarUrl: next.avatarUrl || null,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save');
        return;
      }
      await load();
    } finally {
      setSavingType(null);
    }
  };

  const refresh = async (row: BotRow) => {
    setRefreshingType(row.type);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/server/bots?serverId=${encodeURIComponent(serverId)}&action=refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: row.type }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Refresh failed');
        return;
      }
      await load();
    } finally {
      setRefreshingType(null);
    }
  };

  return (
    <div
      className="rounded-xl border border-lc-border bg-lc-dark p-6 space-y-4"
      data-testid="bots-settings"
    >
      <div>
        <h3 className="text-sm font-semibold text-lc-white">Price Bots</h3>
        <p className="text-xs text-lc-muted max-w-md mt-1">
          Prebuilt bots that appear in the right-side member list and show live
          price data (from <a href="https://yadio.io" target="_blank" rel="noreferrer" className="text-lc-green hover:underline">yadio.io</a>). Toggle each
          one on/off per server.
        </p>
      </div>

      {loading && <div className="text-xs text-lc-muted">Loading…</div>}

      {!loading && bots.length === 0 && (
        <div className="text-xs text-lc-muted">No bots available.</div>
      )}

      {bots.map((row) => (
        <div
          key={row.type}
          className="rounded-lg border border-lc-border bg-lc-black/40 p-4 space-y-3"
          data-testid={`bot-row-${row.type}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-lc-white">
                {row.displayName || row.defaultName}
                <span className="ml-2 text-[10px] font-mono text-lc-muted">{row.type}</span>
              </div>
              <div className="text-[11px] text-lc-muted truncate">
                {row.lastValue
                  ? `Last value: ${row.lastValue}${row.lastFetchAt ? ` · ${new Date(row.lastFetchAt).toLocaleTimeString()}` : ''}`
                  : 'No data yet'}
              </div>
            </div>
            <label className="flex items-center gap-2 shrink-0">
              <input
                type="checkbox"
                checked={row.enabled}
                disabled={savingType === row.type}
                onChange={(e) => save(row, { enabled: e.target.checked })}
                data-testid={`bot-enable-${row.type}`}
              />
              <span className="text-xs text-lc-muted">Enabled</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-lc-muted mb-1 uppercase tracking-wider">
                Display name
              </label>
              <input
                type="text"
                defaultValue={row.displayName ?? ''}
                placeholder={row.defaultName}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (row.displayName ?? '')) {
                    void save(row, { displayName: v || null });
                  }
                }}
                className="w-full px-2 py-1.5 rounded bg-lc-black border border-lc-border text-lc-white text-xs focus:border-lc-green focus:outline-none"
                data-testid={`bot-name-${row.type}`}
              />
            </div>
            <div>
              <label className="block text-[10px] text-lc-muted mb-1 uppercase tracking-wider">
                Avatar URL
              </label>
              <input
                type="text"
                defaultValue={row.avatarUrl ?? ''}
                placeholder={row.defaultAvatar}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (row.avatarUrl ?? '')) {
                    void save(row, { avatarUrl: v || null });
                  }
                }}
                className="w-full px-2 py-1.5 rounded bg-lc-black border border-lc-border text-lc-white text-xs focus:border-lc-green focus:outline-none"
                data-testid={`bot-avatar-${row.type}`}
              />
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => void refresh(row)}
              disabled={!row.id || refreshingType === row.type}
              className="px-3 py-1 rounded-full text-xs bg-lc-border text-lc-white hover:bg-lc-border/70 disabled:opacity-50"
              data-testid={`bot-refresh-${row.type}`}
            >
              {refreshingType === row.type ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
        </div>
      ))}

      {error && (
        <div className="text-xs text-red-400" data-testid="bots-error">
          {error}
        </div>
      )}
    </div>
  );
}
