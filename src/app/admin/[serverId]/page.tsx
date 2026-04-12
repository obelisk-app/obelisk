'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import MemberRow from '@/components/admin/MemberRow';
import ChannelManager from '@/components/admin/ChannelManager';
import AccessControlPanel from '@/components/admin/AccessControlPanel';
import ServerPicker, { type AdminServerOption } from '@/components/admin/ServerPicker';
import CreateServerModal from '@/components/admin/CreateServerModal';
import MembershipsModal from '@/components/admin/MembershipsModal';
import WelcomeBotSettings from '@/components/admin/WelcomeBotSettings';
import EmojiManager from '@/components/admin/EmojiManager';
import GifManager from '@/components/admin/GifManager';
import RoleManager from '@/components/admin/RoleManager';
import SystemContentManager from '@/components/admin/SystemContentManager';
import type { Role } from '@/lib/auth-roles';

type Tab = 'members' | 'channels' | 'roles' | 'access' | 'settings' | 'bans' | 'emojis' | 'gifs' | 'content';

interface MemberData {
  id: string;
  pubkey: string;
  role: Role;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  joinedAt: string;
  banned: boolean;
  customRoles?: { role: { id: string; name: string; color: string; icon: string | null; priority: number } }[];
}

interface ServerSettings {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  joinMode: string;
  wotEnabled: boolean;
  ownerPubkey: string;
  welcomeChannelId: string | null;
  welcomeLocale: string | null;
  maxImageBytes: number;
  maxVideoBytes: number;
  maxDocBytes: number;
  maxAudioBytes: number;
  allowedMimeTypes: string | null;
}

interface RoleResponse {
  role: Role;
  pubkey: string;
  serverId: string;
  instanceOwner: boolean;
}

const TAB_LABELS: Record<Tab, string> = {
  members: 'Members',
  channels: 'Channels',
  roles: 'Roles',
  access: 'Access Control',
  settings: 'Settings',
  bans: 'Bans',
  emojis: 'Emojis',
  gifs: 'GIFs',
  content: 'Content',
};

export default function AdminServerPage({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const router = useRouter();
  const [serverId, setServerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    params.then((p) => {
      if (!cancelled) setServerId(p.serverId);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const [tab, setTab] = useState<Tab>('members');
  const [role, setRole] = useState<Role | null>(null);
  const [instanceOwner, setInstanceOwner] = useState(false);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [servers, setServers] = useState<AdminServerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [memberToManage, setMemberToManage] = useState<{ pubkey: string; displayName: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [serverCustomRoles, setServerCustomRoles] = useState<{ id: string; name: string; color: string }[]>([]);

  // Auth + role check (server-scoped via query param)
  useEffect(() => {
    if (!serverId) return;
    setRole(null);
    setLoading(true);
    setAccessDenied(false);
    fetch(`/api/auth/me/role?serverId=${encodeURIComponent(serverId)}`)
      .then((r) => {
        if (r.status === 401) {
          router.push('/');
          return null;
        }
        if (!r.ok) return null;
        return r.json() as Promise<RoleResponse>;
      })
      .then((data) => {
        if (!data) return;
        if (data.role !== 'owner' && data.role !== 'admin') {
          setAccessDenied(true);
        } else {
          setRole(data.role);
          setInstanceOwner(data.instanceOwner);
        }
      })
      .catch(() => router.push('/'));
  }, [router, serverId]);

  // Fetch the list of servers the caller can administer (for the picker)
  useEffect(() => {
    fetch('/api/admin/servers')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.servers) setServers(data.servers);
      })
      .catch(() => {/* picker will just be empty */});
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!serverId) return;
    const res = await fetch(`/api/admin/members?serverId=${encodeURIComponent(serverId)}`);
    if (res.ok) setMembers(await res.json());
  }, [serverId]);

  const fetchServer = useCallback(async () => {
    if (!serverId) return;
    const res = await fetch(`/api/admin/server?serverId=${encodeURIComponent(serverId)}`);
    if (res.ok) setServer(await res.json());
  }, [serverId]);

  const fetchCustomRoles = useCallback(async () => {
    if (!serverId) return;
    const res = await fetch(`/api/admin/roles?serverId=${encodeURIComponent(serverId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        setServerCustomRoles(data.map((r: { id: string; name: string; color: string }) => ({
          id: r.id, name: r.name, color: r.color,
        })));
      }
    }
  }, [serverId]);

  useEffect(() => {
    if (!role || !serverId) return;
    Promise.all([fetchMembers(), fetchServer(), fetchCustomRoles()]).finally(() => setLoading(false));
  }, [role, serverId, fetchMembers, fetchServer, fetchCustomRoles]);

  const handleCustomRoleToggle = async (memberId: string, roleId: string, assign: boolean) => {
    const method = assign ? 'POST' : 'DELETE';
    const res = await fetch(`/api/admin/roles/${roleId}/members`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
    if (res.ok) {
      await fetchMembers();
    }
  };

  const handleRoleChange = async (pubkey: string, newRole: Role) => {
    if (!serverId) return;
    const res = await fetch(
      `/api/admin/members/${pubkey}/role?serverId=${encodeURIComponent(serverId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      }
    );
    if (res.ok) fetchMembers();
  };

  const handleKick = async (pubkey: string) => {
    if (!serverId) return;
    const res = await fetch(
      `/api/admin/members/${pubkey}/kick?serverId=${encodeURIComponent(serverId)}`,
      { method: 'POST' }
    );
    if (res.ok) fetchMembers();
  };

  const handleBan = async (pubkey: string, reason: string) => {
    if (!serverId) return;
    const res = await fetch(
      `/api/admin/members/${pubkey}/ban?serverId=${encodeURIComponent(serverId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      }
    );
    if (res.ok) fetchMembers();
  };

  const handleUnban = async (pubkey: string) => {
    if (!serverId) return;
    const res = await fetch(
      `/api/admin/members/${pubkey}/ban?serverId=${encodeURIComponent(serverId)}`,
      { method: 'DELETE' }
    );
    if (res.ok) fetchMembers();
  };

  const handleDeleteServer = async () => {
    if (!server || !serverId) return;
    const confirmText = window.prompt(
      `This will PERMANENTLY delete "${server.name}" along with every channel, message, member, role, ban, invite and forum post. This cannot be undone.\n\nType the server name to confirm:`
    );
    if (confirmText === null) return; // user cancelled
    if (confirmText !== server.name) {
      setDeleteError('Server name did not match. Deletion cancelled.');
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/admin/server?serverId=${encodeURIComponent(serverId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data?.error || `Delete failed (HTTP ${res.status})`);
        setDeleting(false);
        return;
      }
      // Send the user back to /admin so the redirect picks the next server
      // (or shows "no admin access" if none remain).
      router.replace('/admin');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  };

  const handleSaveServer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!server || !serverId) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const rawWelcomeChannel = (form.get('welcomeChannelId') as string) ?? '';
    const rawWelcomeLocale = (form.get('welcomeLocale') as string) ?? '';
    const body: Record<string, string | null> = {
      name: form.get('name') as string,
      icon: (form.get('icon') as string) || null,
      banner: (form.get('banner') as string) || null,
      welcomeChannelId: rawWelcomeChannel === '' ? null : rawWelcomeChannel,
      // When the bot is disabled (no channel), also clear the locale so the
      // stored state stays consistent. Otherwise persist whatever the admin
      // picked (defaults to 'es' in the component).
      welcomeLocale: rawWelcomeChannel === '' ? null : rawWelcomeLocale || 'es',
    };
    // ownerPubkey transfer is instance-owner only
    if (instanceOwner) {
      const newOwner = (form.get('ownerPubkey') as string)?.trim();
      if (newOwner && newOwner !== server.ownerPubkey) {
        body.ownerPubkey = newOwner;
      }
    }
    await fetch(`/api/admin/server?serverId=${encodeURIComponent(serverId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await fetchServer();
    setSaving(false);
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
            You need admin or owner permissions on this server.
          </p>
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

  if (!serverId || !role || loading) {
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
      {/* Sticky Header */}
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
            {instanceOwner && (
              <span
                className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider text-purple-300"
                title="Instance Owner — global access across every server"
                data-testid="instance-owner-badge"
              >
                Instance Owner
              </span>
            )}
          </div>
          <div className="flex-shrink-0">
            {servers.length > 0 && (
              <ServerPicker
                servers={servers}
                currentServerId={serverId}
                canCreateServer={instanceOwner}
                onCreateServer={() => setShowCreateServer(true)}
              />
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {(['members', 'channels', 'content', 'access', 'settings', 'emojis', 'gifs', 'bans'] as Tab[]).map((t) => {
              const isActive = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 flex-shrink-0 ${
                    isActive
                      ? 'border-lc-green text-lc-green'
                      : 'border-transparent text-lc-muted hover:text-lc-white'
                  }`}
                >
                  {t === 'bans' ? `${TAB_LABELS[t]} (${bannedMembers.length})` : TAB_LABELS[t]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* Members Tab */}
        {tab === 'members' && (
          <div className="space-y-1" data-testid="members-tab">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-lc-muted">{activeMembers.length} members</p>
              <button
                onClick={async () => {
                  setSyncing(true);
                  setSyncResult(null);
                  try {
                    const res = await fetch(
                      `/api/admin/refresh-profiles?serverId=${encodeURIComponent(serverId)}`,
                      { method: 'POST' }
                    );
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
            {syncResult && <p className="text-xs text-lc-green mb-2">{syncResult}</p>}
            <div className="rounded-xl border border-lc-border bg-lc-dark/40 divide-y divide-lc-border/60 overflow-hidden">
              {activeMembers.length === 0 ? (
                <p className="text-sm text-lc-muted py-12 text-center">No members yet</p>
              ) : (
                activeMembers.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isOwner={isOwner}
                    isInstanceOwner={instanceOwner}
                    serverCustomRoles={serverCustomRoles}
                    onRoleChange={handleRoleChange}
                    onCustomRoleToggle={handleCustomRoleToggle}
                    onKick={handleKick}
                    onBan={handleBan}
                    onUnban={handleUnban}
                    onManageMemberships={(pk, dn) => setMemberToManage({ pubkey: pk, displayName: dn })}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Channels Tab */}
        {tab === 'channels' && (
          <div data-testid="channels-tab">
            <ChannelManager serverId={serverId} isOwner={isOwner} />
          </div>
        )}

        {/* Roles Tab */}
        {tab === 'roles' && (
          <div data-testid="roles-tab">
            <RoleManager serverId={serverId} />
          </div>
        )}

        {/* Emojis Tab */}
        {tab === 'emojis' && (
          <div data-testid="emojis-tab">
            <EmojiManager serverId={serverId} />
          </div>
        )}

        {/* GIFs Tab — curated per-server GIF library */}
        {tab === 'gifs' && (
          <div data-testid="gifs-tab">
            <GifManager serverId={serverId} />
          </div>
        )}

        {/* Content Tab — "post as the server" welcome messages + forum posts */}
        {tab === 'content' && (
          <div data-testid="content-tab">
            <SystemContentManager serverId={serverId} />
          </div>
        )}

        {/* Access Control Tab — unified join mode + WoT + invitations */}
        {tab === 'access' && server && (
          <div data-testid="access-tab">
            <AccessControlPanel
              serverId={server.id}
              isOwner={isOwner}
              onModeChanged={fetchServer}
            />
          </div>
        )}

        {/* Server Settings Tab */}
        {tab === 'settings' && server && (
          <div className="max-w-2xl space-y-8" data-testid="settings-tab">
            <form onSubmit={handleSaveServer} className="space-y-5">
              <div className="rounded-xl border border-lc-border bg-lc-dark/40 p-6 space-y-5">
                <h3 className="text-sm font-semibold text-lc-white">Server Profile</h3>
                <div>
                  <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">Name</label>
                  <input
                    name="name"
                    defaultValue={server.name}
                    className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">Icon URL</label>
                  <input
                    name="icon"
                    defaultValue={server.icon || ''}
                    className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">Banner URL</label>
                  <input
                    name="banner"
                    defaultValue={server.banner || ''}
                    className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Welcome bot */}
              {serverId && (
                <WelcomeBotSettings
                  serverId={serverId}
                  serverName={server.name}
                  currentChannelId={server.welcomeChannelId}
                  currentLocale={server.welcomeLocale}
                  previewMember={
                    members.length > 0
                      ? { displayName: members[0].displayName, picture: members[0].picture }
                      : null
                  }
                />
              )}

              {/* Ownership — instance-owner only */}
              {instanceOwner && (
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-6 space-y-3" data-testid="ownership-section">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-lc-white">Server Owner Pubkey</h3>
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-[10px] font-bold uppercase tracking-wider text-purple-300">
                      Instance Owner Only
                    </span>
                  </div>
                  <p className="text-xs text-lc-muted">
                    The Nostr account that owns this server. Changing it transfers
                    full ownership — the new owner gains the highest role.
                  </p>
                  <input
                    name="ownerPubkey"
                    defaultValue={server.ownerPubkey}
                    placeholder="64-char hex pubkey"
                    className="w-full px-3 py-2 rounded-lg bg-lc-black border border-purple-500/30 text-lc-white text-xs font-mono focus:border-purple-400 focus:outline-none transition-colors"
                    data-testid="owner-pubkey-input"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !isOwner}
                className="px-6 py-2 rounded-full bg-lc-green text-lc-black font-semibold text-sm hover:brightness-110 transition disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>

            {/* Upload limits — owner only, separate form to keep the main
                profile save path untouched. Fields use MB in the UI and are
                converted to bytes before sending. */}
            {isOwner && (
              <UploadLimitsForm
                serverId={serverId}
                server={server}
                onSaved={fetchServer}
              />
            )}

            {/* Access controls live in the dedicated Access Control tab. */}
            {isOwner && (
              <div className="rounded-xl border border-lc-border bg-lc-dark/40 p-6">
                <h3 className="text-sm font-semibold text-lc-white mb-1">Access Control</h3>
                <p className="text-xs text-lc-muted mb-3">
                  Join mode, Web of Trust settings, and invitation links all
                  live in their own tab now.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('access')}
                  className="text-xs font-medium text-lc-green hover:underline"
                  data-testid="goto-access-control"
                >
                  Open Access Control →
                </button>
              </div>
            )}

            {/* Danger Zone — owner only */}
            {isOwner && (
              <div
                className="rounded-xl border border-red-500/40 bg-red-500/5 p-6 space-y-3"
                data-testid="danger-zone"
              >
                <h3 className="text-sm font-semibold text-red-300">Danger Zone</h3>
                <p className="text-xs text-lc-muted">
                  Permanently delete this server and every channel, message,
                  member, role, ban and invitation linked to it. This action
                  cannot be undone.
                </p>
                {deleteError && (
                  <p className="text-xs text-red-400" data-testid="delete-error">
                    {deleteError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleDeleteServer}
                  disabled={deleting}
                  className="px-4 py-2 rounded-full bg-red-600 text-white text-xs font-semibold hover:brightness-110 transition disabled:opacity-50"
                  data-testid="delete-server-button"
                >
                  {deleting ? 'Deleting…' : 'Delete server'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create Server Modal — instance owner only */}
        {showCreateServer && instanceOwner && (
          <CreateServerModal
            onClose={() => setShowCreateServer(false)}
            onCreated={(srv) => {
              setShowCreateServer(false);
              router.push(`/admin/${srv.id}`);
            }}
          />
        )}

        {/* Cross-server membership editor — instance owner only */}
        {memberToManage && instanceOwner && (
          <MembershipsModal
            pubkey={memberToManage.pubkey}
            displayName={memberToManage.displayName}
            onClose={() => {
              setMemberToManage(null);
              // Refresh members list since memberships may have changed for the current server too
              fetchMembers();
            }}
          />
        )}

        {/* Bans Tab */}
        {tab === 'bans' && (
          <div data-testid="bans-tab">
            {bannedMembers.length === 0 ? (
              <div className="rounded-xl border border-lc-border bg-lc-dark/40 py-12">
                <p className="text-sm text-lc-muted text-center">No banned users</p>
              </div>
            ) : (
              <div className="rounded-xl border border-lc-border bg-lc-dark/40 divide-y divide-lc-border/60 overflow-hidden">
                {bannedMembers.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isOwner={isOwner}
                    isInstanceOwner={instanceOwner}
                    serverCustomRoles={serverCustomRoles}
                    onRoleChange={handleRoleChange}
                    onCustomRoleToggle={handleCustomRoleToggle}
                    onKick={handleKick}
                    onBan={handleBan}
                    onUnban={handleUnban}
                    onManageMemberships={(pk, dn) => setMemberToManage({ pubkey: pk, displayName: dn })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Owner-facing upload-limits form. MB in the UI, bytes on the wire. Mime
 * categories are shown as 4 checkboxes; null `allowedMimeTypes` means "use
 * global allowlist" (all boxes treated as checked).
 */
const MIME_CATEGORIES: {
  label: string;
  mimes: string[];
}[] = [
  { label: 'Images', mimes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] },
  { label: 'Videos', mimes: ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'] },
  { label: 'Audio', mimes: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/webm'] },
  {
    label: 'Documents',
    mimes: [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'application/zip',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
];

function UploadLimitsForm({
  serverId,
  server,
  onSaved,
}: {
  serverId: string;
  server: ServerSettings;
  onSaved: () => Promise<void> | void;
}) {
  const toMb = (b: number) => Math.round(b / (1024 * 1024));
  const [imageMb, setImageMb] = useState(toMb(server.maxImageBytes));
  const [videoMb, setVideoMb] = useState(toMb(server.maxVideoBytes));
  const [audioMb, setAudioMb] = useState(toMb(server.maxAudioBytes));
  const [docMb, setDocMb] = useState(toMb(server.maxDocBytes));

  // Parse the stored JSON into a per-category checkbox state. null = all on.
  const parseAllowed = (raw: string | null): Record<string, boolean> => {
    const map: Record<string, boolean> = {};
    let list: string[] | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === 'string');
      } catch {
        list = null;
      }
    }
    for (const cat of MIME_CATEGORIES) {
      map[cat.label] = list === null ? true : cat.mimes.every((m) => list!.includes(m));
    }
    return map;
  };
  const [enabledCats, setEnabledCats] = useState(parseAllowed(server.allowedMimeTypes));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    // If every category is enabled, send null so we fall back to the global
    // allowlist. Otherwise flatten the enabled mimes into an array.
    const allEnabled = MIME_CATEGORIES.every((c) => enabledCats[c.label]);
    const allowedMimeTypes: string[] | null = allEnabled
      ? null
      : MIME_CATEGORIES.filter((c) => enabledCats[c.label]).flatMap((c) => c.mimes);

    const body = {
      maxImageBytes: imageMb * 1024 * 1024,
      maxVideoBytes: videoMb * 1024 * 1024,
      maxAudioBytes: audioMb * 1024 * 1024,
      maxDocBytes: docMb * 1024 * 1024,
      allowedMimeTypes,
    };
    try {
      const res = await fetch(`/api/admin/server?serverId=${encodeURIComponent(serverId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data?.error || `Save failed (${res.status})`);
        return;
      }
      setStatus('Saved');
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-lc-border bg-lc-dark/40 p-6 space-y-5"
      data-testid="upload-limits-form"
    >
      <div>
        <h3 className="text-sm font-semibold text-lc-white">Upload limits</h3>
        <p className="text-xs text-lc-muted">
          Per-category caps (in MB) and which file types are accepted on this server.
          Absolute ceiling is 500 MB regardless of configuration.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block text-xs text-lc-muted uppercase tracking-wider">
          Images (MB)
          <input
            type="number"
            min={1}
            max={500}
            value={imageMb}
            onChange={(e) => setImageMb(Math.max(1, Number(e.target.value)))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm"
            data-testid="limit-image"
          />
        </label>
        <label className="block text-xs text-lc-muted uppercase tracking-wider">
          Videos (MB)
          <input
            type="number"
            min={1}
            max={500}
            value={videoMb}
            onChange={(e) => setVideoMb(Math.max(1, Number(e.target.value)))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm"
            data-testid="limit-video"
          />
        </label>
        <label className="block text-xs text-lc-muted uppercase tracking-wider">
          Audio (MB)
          <input
            type="number"
            min={1}
            max={500}
            value={audioMb}
            onChange={(e) => setAudioMb(Math.max(1, Number(e.target.value)))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm"
            data-testid="limit-audio"
          />
        </label>
        <label className="block text-xs text-lc-muted uppercase tracking-wider">
          Documents (MB)
          <input
            type="number"
            min={1}
            max={500}
            value={docMb}
            onChange={(e) => setDocMb(Math.max(1, Number(e.target.value)))}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm"
            data-testid="limit-doc"
          />
        </label>
      </div>
      <div>
        <p className="text-xs text-lc-muted uppercase tracking-wider mb-2">Allowed types</p>
        <div className="flex flex-wrap gap-3">
          {MIME_CATEGORIES.map((cat) => (
            <label
              key={cat.label}
              className="inline-flex items-center gap-2 text-sm text-lc-white"
            >
              <input
                type="checkbox"
                checked={!!enabledCats[cat.label]}
                onChange={(e) =>
                  setEnabledCats((prev) => ({ ...prev, [cat.label]: e.target.checked }))
                }
                data-testid={`mime-cat-${cat.label.toLowerCase()}`}
              />
              {cat.label}
            </label>
          ))}
        </div>
      </div>
      {status && (
        <p className="text-xs text-lc-green" data-testid="upload-limits-status">
          {status}
        </p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2 rounded-full bg-lc-green text-lc-black font-semibold text-xs hover:brightness-110 transition disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save upload limits'}
      </button>
    </form>
  );
}
