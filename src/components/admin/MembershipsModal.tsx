'use client';

import { useEffect, useState, useCallback } from 'react';
import { shortNpub } from '@/lib/mentions';

interface ServerMembership {
  id: string;
  name: string;
  icon: string | null;
  role: 'owner' | 'admin' | 'mod' | 'member' | null;
  isMember: boolean;
  isServerOwner: boolean;
}

interface MembershipsModalProps {
  pubkey: string;
  displayName: string | null;
  onClose: () => void;
}

/**
 * Modal that lists every server in the instance and lets the instance owner
 * add/remove the target user from each one. Backed by
 * /api/admin/users/[pubkey]/memberships.
 */
export default function MembershipsModal({ pubkey, displayName, onClose }: MembershipsModalProps) {
  const [servers, setServers] = useState<ServerMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${pubkey}/memberships`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load memberships');
        return;
      }
      const data = await res.json();
      setServers(data.servers ?? []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAdd = async (serverId: string) => {
    setBusyId(serverId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${pubkey}/memberships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, role: 'member' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to add');
        return;
      }
      await fetchData();
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (serverId: string) => {
    setBusyId(serverId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/users/${pubkey}/memberships?serverId=${encodeURIComponent(serverId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to remove');
        return;
      }
      await fetchData();
    } finally {
      setBusyId(null);
    }
  };

  const shortPubkey = shortNpub(pubkey);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="memberships-modal"
    >
      <div
        className="bg-lc-dark border border-lc-border rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-lc-border">
          <div>
            <h2 className="text-lg font-bold text-lc-white">Server Memberships</h2>
            <p className="text-xs text-lc-muted mt-1 font-mono">
              {displayName ? `${displayName} • ` : ''}
              {shortPubkey}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-lc-muted hover:text-lc-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {error && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">
              {error}
            </div>
          )}

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 lc-skeleton rounded-lg" />
              ))}
            </div>
          ) : servers.length === 0 ? (
            <p className="text-sm text-lc-muted text-center py-8">No servers found</p>
          ) : (
            <div className="space-y-1">
              {servers.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                  data-testid="membership-row"
                >
                  {s.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.icon} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-lc-border flex items-center justify-center text-xs font-bold text-lc-muted flex-shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-lc-white truncate">{s.name}</div>
                    {s.role && (
                      <div
                        className={`text-[10px] uppercase font-semibold tracking-wider mt-0.5 ${
                          s.role === 'owner'
                            ? 'text-lc-green'
                            : s.role === 'admin'
                              ? 'text-amber-400'
                              : s.role === 'mod'
                                ? 'text-blue-400'
                                : 'text-lc-muted'
                        }`}
                      >
                        {s.role}
                      </div>
                    )}
                  </div>

                  {s.isServerOwner ? (
                    <span className="text-[10px] uppercase tracking-wider text-lc-muted">
                      owner — transfer to remove
                    </span>
                  ) : s.isMember ? (
                    <button
                      type="button"
                      onClick={() => handleRemove(s.id)}
                      disabled={busyId === s.id}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-lc-border text-lc-muted hover:border-red-500 hover:text-red-500 transition-colors disabled:opacity-50"
                      data-testid={`remove-${s.id}`}
                    >
                      {busyId === s.id ? '...' : 'Remove'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAdd(s.id)}
                      disabled={busyId === s.id}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-lc-green text-lc-black hover:brightness-110 transition disabled:opacity-50"
                      data-testid={`add-${s.id}`}
                    >
                      {busyId === s.id ? '...' : 'Add'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
