'use client';

import { useEffect, useState, useCallback } from 'react';
import { nip19 } from 'nostr-tools';

interface AccessConfig {
  referentePubkey: string | null;
  wotEnabled: boolean;
  referenteFetchedAt: string | null;
}

interface WotEntry {
  id: string;
  pubkey: string;
  addedAt: string;
}

interface Override {
  id: string;
  pubkey: string;
  addedBy: string;
  reason: string | null;
  createdAt: string;
}

interface AccessPanelProps {
  serverId: string;
  isOwner: boolean;
}

function normalizePubkey(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') return decoded.data as string;
  } catch {
    /* not a valid nip19 string */
  }
  return null;
}

export default function AccessPanel({ serverId, isOwner }: AccessPanelProps) {
  const [config, setConfig] = useState<AccessConfig | null>(null);
  const [entries, setEntries] = useState<WotEntry[]>([]);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [referenteInput, setReferenteInput] = useState('');
  const [search, setSearch] = useState('');
  const [overrideInput, setOverrideInput] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [accessRes, wotRes, ovRes] = await Promise.all([
      fetch(`/api/servers/${serverId}/access`),
      fetch(`/api/servers/${serverId}/wot?take=50`),
      fetch(`/api/servers/${serverId}/wot/overrides`),
    ]);
    if (accessRes.ok) {
      const c = await accessRes.json();
      setConfig(c);
      setReferenteInput(c.referentePubkey || '');
    }
    if (wotRes.ok) {
      const w = await wotRes.json();
      setEntries(w.entries);
      setEntriesTotal(w.total);
    }
    if (ovRes.ok) {
      const o = await ovRes.json();
      setOverrides(o.overrides);
    }
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const searchEntries = async (q: string) => {
    setSearch(q);
    const res = await fetch(`/api/servers/${serverId}/wot?take=50&search=${encodeURIComponent(q)}`);
    if (res.ok) {
      const w = await res.json();
      setEntries(w.entries);
      setEntriesTotal(w.total);
    }
  };

  const saveReferente = async () => {
    setError(null);
    const normalized = referenteInput.trim() ? normalizePubkey(referenteInput) : null;
    if (referenteInput.trim() && !normalized) {
      setError('Invalid pubkey or npub');
      return;
    }
    const res = await fetch(`/api/servers/${serverId}/access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referentePubkey: normalized }),
    });
    if (res.ok) {
      const c = await res.json();
      setConfig((prev) => (prev ? { ...prev, ...c } : c));
    } else {
      setError('Failed to save referente');
    }
  };

  const toggleWot = async () => {
    if (!config) return;
    const next = !config.wotEnabled;
    const res = await fetch(`/api/servers/${serverId}/access`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wotEnabled: next }),
    });
    if (res.ok) {
      const c = await res.json();
      setConfig((prev) => (prev ? { ...prev, ...c } : c));
    }
  };

  const refreshWot = async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/wot-refresh`, { method: 'POST' });
      if (res.ok) {
        const r = await res.json();
        setRefreshMsg(`Synced: +${r.added} / -${r.removed} / total ${r.total}`);
        await loadAll();
      } else {
        const j = await res.json().catch(() => ({}));
        setRefreshMsg(j.error || 'Refresh failed');
      }
    } finally {
      setRefreshing(false);
    }
  };

  const addOverride = async () => {
    setError(null);
    const normalized = normalizePubkey(overrideInput);
    if (!normalized) {
      setError('Invalid pubkey or npub');
      return;
    }
    const res = await fetch(`/api/servers/${serverId}/wot/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey: normalized, reason: overrideReason || undefined }),
    });
    if (res.ok) {
      setOverrideInput('');
      setOverrideReason('');
      await loadAll();
    }
  };

  const removeOverride = async (pubkey: string) => {
    const res = await fetch(
      `/api/servers/${serverId}/wot/overrides?pubkey=${encodeURIComponent(pubkey)}`,
      { method: 'DELETE' }
    );
    if (res.ok) await loadAll();
  };

  if (loading || !config) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="lc-skeleton h-16" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="access-panel">
      {error && (
        <div className="rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Referente + WoT toggle */}
      <section className="bg-lc-dark border border-lc-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-lc-white mb-1">Web of Trust</h3>
        <p className="text-xs text-lc-muted mb-3">
          Designate a referente Nostr account. When WoT is enabled, only users that the
          referente follows (or are on the override list, or hold a valid invite) can join.
          Enabling WoT replaces the open / invite-only setting.
        </p>

        <label className="text-xs text-lc-muted block mb-1">Referente npub</label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={referenteInput}
            onChange={(e) => setReferenteInput(e.target.value)}
            placeholder="npub1... or hex pubkey"
            disabled={!isOwner}
            className="flex-1 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm font-mono focus:border-lc-green focus:outline-none disabled:opacity-50"
            data-testid="referente-input"
          />
          {isOwner && (
            <button
              onClick={saveReferente}
              className="lc-pill-secondary px-4 py-2 text-sm font-medium"
              data-testid="save-referente-btn"
            >
              Save
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={toggleWot}
            disabled={!isOwner || !config.referentePubkey}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              config.wotEnabled
                ? 'bg-lc-green text-lc-black'
                : 'border border-lc-border text-lc-muted hover:text-lc-white'
            } disabled:opacity-50`}
            data-testid="toggle-wot-btn"
          >
            {config.wotEnabled ? 'WoT Enabled' : 'WoT Disabled'}
          </button>
          <button
            onClick={refreshWot}
            disabled={refreshing || !config.referentePubkey}
            className="px-4 py-2 rounded-full text-xs font-medium border border-lc-border text-lc-muted hover:text-lc-white hover:border-lc-green transition-colors disabled:opacity-50"
            data-testid="refresh-wot-btn"
          >
            {refreshing ? 'Refreshing...' : 'Refresh WoT'}
          </button>
          {config.referenteFetchedAt && (
            <span className="text-xs text-lc-muted">
              Last fetched {new Date(config.referenteFetchedAt).toLocaleString()}
            </span>
          )}
        </div>
        {refreshMsg && <p className="text-xs text-lc-green">{refreshMsg}</p>}
      </section>

      {/* WoT entries list */}
      <section className="bg-lc-dark border border-lc-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-lc-white">Auto-authorized ({entriesTotal})</h3>
          <input
            type="text"
            value={search}
            onChange={(e) => searchEntries(e.target.value)}
            placeholder="Search pubkey..."
            className="px-2 py-1 rounded-lg bg-lc-black border border-lc-border text-lc-white text-xs font-mono w-48 focus:border-lc-green focus:outline-none"
          />
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-xs text-lc-muted py-4 text-center">No entries yet — set a referente and click "Refresh WoT".</p>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs font-mono px-2 py-1 rounded hover:bg-lc-black">
                <span className="text-lc-muted truncate">{e.pubkey}</span>
                <span className="text-lc-muted shrink-0 ml-2">{new Date(e.addedAt).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Overrides */}
      <section className="bg-lc-dark border border-lc-border rounded-xl p-4">
        <h3 className="text-sm font-semibold text-lc-white mb-1">Manual overrides</h3>
        <p className="text-xs text-lc-muted mb-3">
          Whitelist specific npubs that aren't followed by the referente.
        </p>
        <div className="grid grid-cols-[1fr,1fr,auto] gap-2 mb-3">
          <input
            type="text"
            value={overrideInput}
            onChange={(e) => setOverrideInput(e.target.value)}
            placeholder="npub1... or hex"
            className="px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm font-mono focus:border-lc-green focus:outline-none"
            data-testid="override-input"
          />
          <input
            type="text"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason (optional)"
            className="px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
          />
          <button
            onClick={addOverride}
            className="lc-pill-primary px-4 py-2 text-sm font-medium"
            data-testid="add-override-btn"
          >
            Add
          </button>
        </div>
        <div className="space-y-1">
          {overrides.length === 0 ? (
            <p className="text-xs text-lc-muted py-2 text-center">No overrides.</p>
          ) : (
            overrides.map((o) => (
              <div key={o.id} className="flex items-center justify-between bg-lc-black px-3 py-2 rounded-lg">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-lc-white truncate">{o.pubkey}</p>
                  {o.reason && <p className="text-xs text-lc-muted">{o.reason}</p>}
                </div>
                <button
                  onClick={() => removeOverride(o.pubkey)}
                  className="text-xs text-lc-muted hover:text-red-400 ml-2"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </section>

    </div>
  );
}
