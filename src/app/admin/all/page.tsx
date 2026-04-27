'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ServerPicker, { type AdminServerOption } from '@/components/admin/ServerPicker';
import MembershipsModal from '@/components/admin/MembershipsModal';
import { shortNpub } from '@/lib/mentions';
import InstanceSettingsPanel from '@/components/admin/InstanceSettingsPanel';
import { extractApiError } from '@/lib/api-json';

interface UserRow {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  serverCount: number;
  bannedCount: number;
  firstSeen: string;
  lastSeen: string;
}

/**
 * /admin/all — instance owner only. Lists every pubkey known to the platform
 * (members of any server + session-only users) so the operator can manage
 * cross-server memberships for users who aren't currently in a specific server.
 */
export default function AdminAllUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [servers, setServers] = useState<AdminServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [query, setQuery] = useState('');
  const [memberToManage, setMemberToManage] = useState<{ pubkey: string; displayName: string | null } | null>(null);
  const [busyPk, setBusyPk] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (res.status === 401) {
      router.push('/');
      return;
    }
    if (res.status === 403) {
      setAccessDenied(true);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
    }
  }, [router]);

  useEffect(() => {
    Promise.all([
      fetchUsers(),
      fetch('/api/admin/servers')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.servers) setServers(data.servers);
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [fetchUsers]);

  const handleRemove = async (u: UserRow) => {
    const label = u.displayName || shortNpub(u.pubkey);
    const short = shortNpub(u.pubkey).replace('…', '');
    const confirmText = window.prompt(
      `This will PERMANENTLY remove "${label}" from the database:\n\n- All memberships across every server\n- All sessions (force logout)\n\nBans and moderation logs are preserved. Type "${short}" to confirm:`
    );
    if (confirmText === null) return;
    if (confirmText.trim() !== short) {
      setActionError('Confirmation text did not match. Removal cancelled.');
      return;
    }
    setActionError(null);
    setBusyPk(u.pubkey);
    try {
      const res = await fetch(`/api/admin/users/${u.pubkey}`, { method: 'DELETE' });
      if (!res.ok) {
        setActionError(await extractApiError(res, 'Remove'));
      } else {
        await fetchUsers();
      }
    } finally {
      setBusyPk(null);
    }
  };

  const handleBan = async (u: UserRow) => {
    const label = u.displayName || shortNpub(u.pubkey);
    const reason = window.prompt(
      `Instance-wide ban for "${label}".\n\nThey will be banned from every server they don't own, kicked from any they're in, and their sessions revoked.\n\nOptional reason:`
    );
    if (reason === null) return;
    setActionError(null);
    setBusyPk(u.pubkey);
    try {
      const res = await fetch(`/api/admin/users/${u.pubkey}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        setActionError(await extractApiError(res, 'Ban'));
      } else {
        await fetchUsers();
      }
    } finally {
      setBusyPk(null);
    }
  };

  const handleUnban = async (u: UserRow) => {
    setActionError(null);
    setBusyPk(u.pubkey);
    try {
      const res = await fetch(`/api/admin/users/${u.pubkey}/ban`, { method: 'DELETE' });
      if (!res.ok) {
        setActionError(await extractApiError(res, 'Unban'));
      } else {
        await fetchUsers();
      }
    } finally {
      setBusyPk(null);
    }
  };

  if (accessDenied) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 rounded-full bg-red-600/10 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-lc-white mb-2">Access Denied</h2>
          <p className="text-sm text-lc-muted mb-6">
            The cross-server user directory is only available to the instance owner.
          </p>
          <button
            onClick={() => router.push('/admin')}
            className="lc-pill-primary px-6 py-2 text-sm font-medium"
          >
            Back to Admin
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="lc-spinner" data-testid="admin-loading" />
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? users.filter((u) =>
        (u.displayName?.toLowerCase().includes(q) ||
          u.nip05?.toLowerCase().includes(q) ||
          u.pubkey.toLowerCase().includes(q)) ?? false
      )
    : users;

  return (
    <div className="min-h-screen bg-lc-black">
      <div className="sticky top-0 z-40 border-b border-lc-border bg-lc-black/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.push('/chat')}
              className="text-lc-muted hover:text-lc-white transition-colors text-sm flex items-center gap-1.5 flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Chat
            </button>
            <div className="h-5 w-px bg-lc-border" />
            <h1 className="text-lg font-bold text-lc-white truncate">Admin Panel</h1>
            <span
              className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider text-purple-300"
              title="Instance Owner — global access across every server"
              data-testid="instance-owner-badge"
            >
              Instance Owner
            </span>
          </div>
          <div className="flex-shrink-0">
            <ServerPicker
              servers={servers}
              currentServerId=""
              showAllUsersEntry
              isAllUsersView
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6" data-testid="all-users-tab">
        <InstanceSettingsPanel servers={servers} />

        <div className="flex items-center justify-between mb-4 gap-4 mt-8">
          <div>
            <h2 className="text-base font-semibold text-lc-white">All users</h2>
            <p className="text-xs text-lc-muted mt-0.5">
              {users.length} total across the instance (including users not in any server)
            </p>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, NIP-05 or pubkey..."
            className="px-3 py-2 rounded-lg bg-lc-dark border border-lc-border text-lc-white text-sm w-72 focus:border-lc-green focus:outline-none transition-colors"
            data-testid="user-search"
          />
        </div>

        {actionError && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
            {actionError}
          </div>
        )}

        <div className="rounded-xl border border-lc-border bg-lc-dark/40 divide-y divide-lc-border/60 overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-sm text-lc-muted py-12 text-center">No users found</p>
          ) : (
            filtered.map((u) => {
              const short = shortNpub(u.pubkey);
              return (
                <div
                  key={u.pubkey}
                  className="flex items-center gap-4 p-3 hover:bg-lc-card/50 transition-colors"
                  data-testid="user-row"
                >
                  {u.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.picture} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-sm font-semibold shrink-0">
                      {(u.displayName || 'A')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-lc-white truncate">
                        {u.displayName || short}
                      </span>
                      {u.serverCount === 0 ? (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-semibold">
                          no server
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-lc-border text-lc-muted font-semibold">
                          {u.serverCount} {u.serverCount === 1 ? 'server' : 'servers'}
                        </span>
                      )}
                      {u.bannedCount > 0 && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-300 font-semibold">
                          banned × {u.bannedCount}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-lc-muted truncate">
                      {u.nip05 || short}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setMemberToManage({ pubkey: u.pubkey, displayName: u.displayName })}
                      className="text-xs px-3 py-1.5 rounded-full border border-purple-500/30 text-purple-300 hover:border-purple-400 hover:text-purple-200 transition-colors"
                      data-testid="manage-memberships-btn"
                    >
                      Servers
                    </button>
                    {u.bannedCount > 0 ? (
                      <button
                        onClick={() => handleUnban(u)}
                        disabled={busyPk === u.pubkey}
                        className="text-xs px-3 py-1.5 rounded-full border border-lc-green text-lc-green hover:bg-lc-green/10 transition-colors disabled:opacity-50"
                        data-testid="unban-btn"
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBan(u)}
                        disabled={busyPk === u.pubkey}
                        className="text-xs px-3 py-1.5 rounded-full border border-lc-border text-lc-muted hover:border-red-500 hover:text-red-500 transition-colors disabled:opacity-50"
                        data-testid="ban-btn"
                      >
                        Ban
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(u)}
                      disabled={busyPk === u.pubkey}
                      className="text-xs px-3 py-1.5 rounded-full border border-lc-border text-lc-muted hover:border-red-500 hover:text-red-500 transition-colors disabled:opacity-50"
                      data-testid="remove-btn"
                      title="Remove user from the database (kick from every server + revoke sessions)"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {memberToManage && (
        <MembershipsModal
          pubkey={memberToManage.pubkey}
          displayName={memberToManage.displayName}
          onClose={() => {
            setMemberToManage(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
