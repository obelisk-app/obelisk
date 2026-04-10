'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import MemberRow from '@/components/admin/MemberRow';
import ChannelManager from '@/components/admin/ChannelManager';
import AccessPanel from '@/components/admin/AccessPanel';
import InviteManager from '@/components/admin/InviteManager';
import type { Role } from '@/lib/auth-roles';

type Tab = 'members' | 'channels' | 'access' | 'invitations' | 'settings' | 'bans';

interface MemberData {
  id: string;
  pubkey: string;
  role: Role;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  joinedAt: string;
  banned: boolean;
}

interface ServerSettings {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  joinMode: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('members');
  const [role, setRole] = useState<Role | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  // Check auth and role via backend (no dependency on Zustand isConnected)
  useEffect(() => {
    fetch('/api/auth/me/role')
      .then((r) => {
        if (!r.ok) { router.push('/'); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.role !== 'owner' && data.role !== 'admin') {
          setAccessDenied(true);
        } else {
          setRole(data.role);
        }
      })
      .catch(() => router.push('/'));
  }, [router]);

  const fetchMembers = useCallback(async () => {
    const res = await fetch('/api/admin/members');
    if (res.ok) setMembers(await res.json());
  }, []);

  const fetchServer = useCallback(async () => {
    const res = await fetch('/api/admin/server');
    if (res.ok) setServer(await res.json());
  }, []);

  useEffect(() => {
    if (!role) return;
    Promise.all([fetchMembers(), fetchServer()]).finally(() => setLoading(false));
  }, [role, fetchMembers, fetchServer]);

  const handleRoleChange = async (pubkey: string, newRole: Role) => {
    const res = await fetch(`/api/admin/members/${pubkey}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) fetchMembers();
  };

  const handleKick = async (pubkey: string) => {
    const res = await fetch(`/api/admin/members/${pubkey}/kick`, { method: 'POST' });
    if (res.ok) fetchMembers();
  };

  const handleBan = async (pubkey: string, reason: string) => {
    const res = await fetch(`/api/admin/members/${pubkey}/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || undefined }),
    });
    if (res.ok) fetchMembers();
  };

  const handleUnban = async (pubkey: string) => {
    const res = await fetch(`/api/admin/members/${pubkey}/ban`, { method: 'DELETE' });
    if (res.ok) fetchMembers();
  };

  const handleSaveServer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!server) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const body = {
      name: form.get('name') as string,
      icon: form.get('icon') as string || null,
      banner: form.get('banner') as string || null,
    };
    await fetch('/api/admin/server', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await fetchServer();
    setSaving(false);
  };

  const handleJoinMode = async (mode: string) => {
    await fetch('/api/admin/server/join-mode', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinMode: mode }),
    });
    await fetchServer();
  };

  if (accessDenied) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 rounded-full bg-red-600/10 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-lc-white mb-2">Access Denied</h2>
          <p className="text-sm text-lc-muted mb-6">You need admin or owner permissions to access this page.</p>
          <button
            onClick={() => router.push('/chat')}
            className="lc-pill-primary px-6 py-2 text-sm font-medium"
          >
            Back to Chat
          </button>
        </div>
      </div>
    );
  }

  if (!role || loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="lc-spinner" data-testid="admin-loading" />
      </div>
    );
  }

  const isOwner = role === 'owner';
  const activeMembers = members.filter((m) => !m.banned);
  const bannedMembers = members.filter((m) => m.banned);

  return (
    <div className="min-h-screen bg-lc-black">
      {/* Header */}
      <div className="border-b border-lc-border bg-lc-dark">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/chat')}
              className="text-lc-muted hover:text-lc-white transition-colors text-sm"
            >
              &larr; Back to chat
            </button>
            <h1 className="text-xl font-bold text-lc-white">Admin Panel</h1>
          </div>
          {server && (
            <span className="text-sm text-lc-muted">{server.name}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex gap-1 border-b border-lc-border mt-4">
          {(['members', 'channels', 'access', 'invitations', 'settings', 'bans'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-lc-green text-lc-green'
                  : 'border-transparent text-lc-muted hover:text-lc-white'
              }`}
            >
              {t === 'bans' ? `Bans (${bannedMembers.length})` : t}
            </button>
          ))}
        </div>

        {/* Members Tab */}
        {tab === 'members' && (
          <div className="mt-4 space-y-1" data-testid="members-tab">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-lc-muted">{activeMembers.length} members</p>
              <button
                onClick={async () => {
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const res = await fetch('/api/admin/refresh-profiles', { method: 'POST' });
                    if (res.ok) {
                      const data = await res.json();
                      setSyncResult(`Synced ${data.updated} profiles`);
                      await fetchMembers();
                    } else {
                      setSyncResult('Sync failed');
                    }
                  } catch {
                    setSyncResult('Sync failed');
                  } finally {
                    setSyncing(false);
                  }
                }}
                disabled={syncing}
                className="px-4 py-1.5 rounded-full text-xs font-medium border border-lc-border text-lc-muted hover:text-lc-white hover:border-lc-green transition-colors disabled:opacity-50"
              >
                {syncing ? 'Syncing...' : 'Sync Nostr Profiles'}
              </button>
            </div>
            {syncResult && (
              <p className="text-xs text-lc-green mb-2">{syncResult}</p>
            )}
            {activeMembers.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isOwner={isOwner}
                onRoleChange={handleRoleChange}
                onKick={handleKick}
                onBan={handleBan}
                onUnban={handleUnban}
              />
            ))}
          </div>
        )}

        {/* Channels Tab */}
        {tab === 'channels' && (
          <div className="mt-4" data-testid="channels-tab">
            <ChannelManager isOwner={isOwner} />
          </div>
        )}

        {/* Access Tab — WoT + invite credit policy */}
        {tab === 'access' && server && (
          <div className="mt-4" data-testid="access-tab">
            <AccessPanel serverId={server.id} isOwner={isOwner} />
          </div>
        )}

        {/* Invitations Tab */}
        {tab === 'invitations' && server && (
          <div className="mt-4" data-testid="invitations-tab">
            <InviteManager serverId={server.id} />
          </div>
        )}

        {/* Server Settings Tab */}
        {tab === 'settings' && server && (
          <div className="mt-6 max-w-md" data-testid="settings-tab">
            <form onSubmit={handleSaveServer} className="space-y-4">
              <div>
                <label className="block text-sm text-lc-muted mb-1">Server Name</label>
                <input
                  name="name"
                  defaultValue={server.name}
                  className="w-full px-3 py-2 rounded-lg bg-lc-dark border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-lc-muted mb-1">Icon URL</label>
                <input
                  name="icon"
                  defaultValue={server.icon || ''}
                  className="w-full px-3 py-2 rounded-lg bg-lc-dark border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-lc-muted mb-1">Banner URL</label>
                <input
                  name="banner"
                  defaultValue={server.banner || ''}
                  className="w-full px-3 py-2 rounded-lg bg-lc-dark border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={saving || !isOwner}
                className="px-6 py-2 rounded-full bg-lc-green text-lc-black font-semibold text-sm hover:brightness-110 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>

            {/* Join Mode */}
            {isOwner && (
              <div className="mt-8 pt-6 border-t border-lc-border">
                <h3 className="text-sm font-semibold text-lc-white mb-3">Access Control</h3>
                <div className="flex gap-3">
                  <button
                    onClick={() => handleJoinMode('open')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      server.joinMode === 'open'
                        ? 'bg-lc-green text-lc-black'
                        : 'border border-lc-border text-lc-muted hover:text-lc-white'
                    }`}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => handleJoinMode('invite-only')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      server.joinMode === 'invite-only'
                        ? 'bg-amber-500 text-black'
                        : 'border border-lc-border text-lc-muted hover:text-lc-white'
                    }`}
                  >
                    Invite Only
                  </button>
                </div>
                <p className="text-xs text-lc-muted mt-2">
                  {server.joinMode === 'open'
                    ? 'Anyone can join by logging in with Nostr.'
                    : 'New users cannot join. Only existing members can log in.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bans Tab */}
        {tab === 'bans' && (
          <div className="mt-4 space-y-1" data-testid="bans-tab">
            {bannedMembers.length === 0 ? (
              <p className="text-sm text-lc-muted py-8 text-center">No banned users</p>
            ) : (
              bannedMembers.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isOwner={isOwner}
                  onRoleChange={handleRoleChange}
                  onKick={handleKick}
                  onBan={handleBan}
                  onUnban={handleUnban}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
