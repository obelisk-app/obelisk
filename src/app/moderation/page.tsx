'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import ModActionCard from '@/components/moderation/ModActionCard';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import type { Role } from '@/lib/auth-roles';

type Tab = 'reports' | 'mutes' | 'warnings' | 'log';

interface Report {
  id: string;
  messageId: string;
  reporterPubkey: string;
  reason: string;
  status: string;
  createdAt: string;
  message: { id: string; content: string; authorPubkey: string; channelId: string } | null;
}

interface MuteEntry {
  id: string;
  targetPubkey: string;
  mutedByPubkey: string;
  expiresAt: string;
  reason: string | null;
  createdAt: string;
}

interface Warning {
  id: string;
  targetPubkey: string;
  issuedByPubkey: string;
  reason: string;
  createdAt: string;
}

interface ModAction {
  id: string;
  actorPubkey: string;
  targetPubkey: string | null;
  action: string;
  reason: string | null;
  metadata: string | null;
  createdAt: string;
}

function shortKey(key: string) {
  return key.slice(0, 8) + '...' + key.slice(-4);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function ModerationPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('reports');
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [mutes, setMutes] = useState<MuteEntry[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [log, setLog] = useState<ModAction[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [hasMoreLog, setHasMoreLog] = useState(false);

  // Mute form
  const [muteForm, setMuteForm] = useState({ pubkey: '', duration: '60', reason: '' });
  const [muteSaving, setMuteSaving] = useState(false);

  // Warn form
  const [warnForm, setWarnForm] = useState({ pubkey: '', reason: '' });
  const [warnSaving, setWarnSaving] = useState(false);

  // Auth check via backend (no dependency on Zustand isConnected)
  useEffect(() => {
    fetch('/api/auth/me/role')
      .then((r) => {
        if (!r.ok) { router.push('/'); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        const r = data.role as Role;
        if (r !== 'owner' && r !== 'admin' && r !== 'mod') {
          setAccessDenied(true);
        } else {
          setRole(r);
        }
      })
      .catch(() => router.push('/'));
  }, [router]);

  const fetchReports = useCallback(async () => {
    const res = await fetch('/api/moderation/reports');
    if (res.ok) setReports(await res.json());
  }, []);

  const fetchMutes = useCallback(async () => {
    const res = await fetch('/api/moderation/mutes');
    if (res.ok) setMutes(await res.json());
  }, []);

  const fetchWarnings = useCallback(async () => {
    const res = await fetch('/api/moderation/warnings');
    if (res.ok) setWarnings(await res.json());
  }, []);

  const fetchLog = useCallback(async (cursor?: string) => {
    const url = cursor ? `/api/moderation/log?cursor=${cursor}` : '/api/moderation/log';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (cursor) {
        setLog((prev) => [...prev, ...data.actions]);
      } else {
        setLog(data.actions);
      }
      setHasMoreLog(data.hasMore ?? false);
    }
  }, []);

  useEffect(() => {
    if (!role) return;
    Promise.all([fetchReports(), fetchMutes(), fetchWarnings(), fetchLog()])
      .finally(() => setLoading(false));
  }, [role, fetchReports, fetchMutes, fetchWarnings, fetchLog]);

  const handleResolve = async (id: string, status: 'resolved' | 'dismissed') => {
    await fetch(`/api/moderation/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchReports();
    fetchLog();
  };

  const handleDeleteMessage = async (messageId: string) => {
    await fetch(`/api/moderation/messages/${messageId}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchReports();
    fetchLog();
  };

  const handleUnmute = async (id: string) => {
    await fetch(`/api/moderation/mutes/${id}`, { method: 'DELETE' });
    fetchMutes();
    fetchLog();
  };

  const handleMuteUser = async () => {
    if (!muteForm.pubkey.trim() || !muteForm.duration) return;
    setMuteSaving(true);
    const res = await fetch('/api/moderation/mutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPubkey: muteForm.pubkey.trim(),
        duration: parseInt(muteForm.duration),
        reason: muteForm.reason || undefined,
      }),
    });
    if (res.ok) {
      setMuteForm({ pubkey: '', duration: '60', reason: '' });
      await Promise.all([fetchMutes(), fetchLog()]);
    }
    setMuteSaving(false);
  };

  const handleWarnUser = async () => {
    if (!warnForm.pubkey.trim() || !warnForm.reason.trim()) return;
    setWarnSaving(true);
    const res = await fetch('/api/moderation/warnings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetPubkey: warnForm.pubkey.trim(),
        reason: warnForm.reason.trim(),
      }),
    });
    if (res.ok) {
      setWarnForm({ pubkey: '', reason: '' });
      await Promise.all([fetchWarnings(), fetchLog()]);
    }
    setWarnSaving(false);
  };

  const handleLoadMoreLog = () => {
    const last = log[log.length - 1];
    if (last) fetchLog(last.createdAt);
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
          <p className="text-sm text-lc-muted mb-6">You need moderator, admin, or owner permissions to access this page.</p>
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
        <div className="lc-spinner" data-testid="mod-loading" />
      </div>
    );
  }

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
            <h1 className="text-xl font-bold text-lc-white">Moderation</h1>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-6">
        <div className="flex gap-1 border-b border-lc-border mt-4">
          {(['reports', 'mutes', 'warnings', 'log'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? 'border-lc-green text-lc-green'
                  : 'border-transparent text-lc-muted hover:text-lc-white'
              }`}
            >
              {t === 'reports' ? `Reports (${reports.length})` : t}
            </button>
          ))}
        </div>

        {/* Reports Tab */}
        {tab === 'reports' && (
          <div className="mt-4 space-y-3" data-testid="reports-tab">
            {reports.length === 0 ? (
              <p className="text-sm text-lc-muted py-8 text-center">No pending reports</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="lc-card p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {r.message && (
                        <div className="bg-lc-black/50 rounded-lg p-3 mb-3 border border-lc-border">
                          <p className="text-xs text-lc-muted mb-1">
                            Message by <span className="font-mono">{shortKey(r.message.authorPubkey)}</span>
                          </p>
                          <p className="text-sm text-lc-white">{r.message.content}</p>
                        </div>
                      )}
                      <p className="text-sm text-lc-white">
                        <span className="text-lc-muted">Reason:</span> {r.reason}
                      </p>
                      <p className="text-xs text-lc-muted mt-1">
                        Reported by {shortKey(r.reporterPubkey)} · {timeAgo(r.createdAt)}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      {r.message && (
                        <button
                          onClick={() => setDeleteConfirm(r.message!.id)}
                          className="text-xs px-3 py-1.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          Delete msg
                        </button>
                      )}
                      <button
                        onClick={() => handleResolve(r.id, 'resolved')}
                        className="text-xs px-3 py-1.5 rounded-full border border-lc-green text-lc-green hover:bg-lc-green/10 transition-colors"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={() => handleResolve(r.id, 'dismissed')}
                        className="text-xs px-3 py-1.5 rounded-full border border-lc-border text-lc-muted hover:text-lc-white transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Mutes Tab */}
        {tab === 'mutes' && (
          <div className="mt-4 space-y-4" data-testid="mutes-tab">
            {/* Mute User Form */}
            <div className="lc-card p-4 space-y-3" data-testid="mute-form">
              <h3 className="text-sm font-semibold text-lc-white">Mute User</h3>
              <div className="flex gap-2">
                <input
                  value={muteForm.pubkey}
                  onChange={(e) => setMuteForm({ ...muteForm, pubkey: e.target.value })}
                  placeholder="Pubkey (hex)"
                  className="flex-1 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none font-mono"
                  data-testid="mute-pubkey"
                />
                <input
                  value={muteForm.duration}
                  onChange={(e) => setMuteForm({ ...muteForm, duration: e.target.value })}
                  placeholder="Minutes"
                  type="number"
                  min="1"
                  className="w-24 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
                  data-testid="mute-duration"
                />
              </div>
              <div className="flex gap-2">
                <input
                  value={muteForm.reason}
                  onChange={(e) => setMuteForm({ ...muteForm, reason: e.target.value })}
                  placeholder="Reason (optional)"
                  className="flex-1 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
                  data-testid="mute-reason"
                />
                <button
                  onClick={handleMuteUser}
                  disabled={muteSaving || !muteForm.pubkey.trim()}
                  className="px-4 py-2 rounded-full bg-amber-500 text-black text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-50"
                  data-testid="mute-submit"
                >
                  {muteSaving ? 'Muting...' : 'Mute'}
                </button>
              </div>
            </div>

            {/* Active Mutes */}
            {mutes.length === 0 ? (
              <p className="text-sm text-lc-muted py-8 text-center">No active mutes</p>
            ) : (
              mutes.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-lc-card/50 transition-colors">
                  <div>
                    <span className="text-sm text-lc-white font-mono">{shortKey(m.targetPubkey)}</span>
                    {m.reason && <span className="text-xs text-lc-muted ml-2">— {m.reason}</span>}
                    <p className="text-xs text-lc-muted">
                      Expires {new Date(m.expiresAt).toLocaleString()} · by {shortKey(m.mutedByPubkey)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleUnmute(m.id)}
                    className="text-xs px-3 py-1.5 rounded-full border border-lc-green text-lc-green hover:bg-lc-green/10 transition-colors"
                  >
                    Unmute
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Warnings Tab */}
        {tab === 'warnings' && (
          <div className="mt-4 space-y-4" data-testid="warnings-tab">
            {/* Warn User Form */}
            <div className="lc-card p-4 space-y-3" data-testid="warn-form">
              <h3 className="text-sm font-semibold text-lc-white">Warn User</h3>
              <input
                value={warnForm.pubkey}
                onChange={(e) => setWarnForm({ ...warnForm, pubkey: e.target.value })}
                placeholder="Pubkey (hex)"
                className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none font-mono"
                data-testid="warn-pubkey"
              />
              <div className="flex gap-2">
                <textarea
                  value={warnForm.reason}
                  onChange={(e) => setWarnForm({ ...warnForm, reason: e.target.value })}
                  placeholder="Reason"
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none resize-none"
                  data-testid="warn-reason"
                />
                <button
                  onClick={handleWarnUser}
                  disabled={warnSaving || !warnForm.pubkey.trim() || !warnForm.reason.trim()}
                  className="self-end px-4 py-2 rounded-full bg-yellow-500 text-black text-sm font-medium hover:bg-yellow-400 transition-colors disabled:opacity-50"
                  data-testid="warn-submit"
                >
                  {warnSaving ? 'Warning...' : 'Warn'}
                </button>
              </div>
            </div>

            {/* Warnings List */}
            {warnings.length === 0 ? (
              <p className="text-sm text-lc-muted py-8 text-center">No warnings issued</p>
            ) : (
              warnings.map((w) => (
                <div key={w.id} className="p-3 rounded-lg hover:bg-lc-card/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-lc-white font-mono">{shortKey(w.targetPubkey)}</span>
                    <span className="text-xs text-yellow-400">⚠ Warning</span>
                  </div>
                  <p className="text-sm text-lc-muted mt-1">{w.reason}</p>
                  <p className="text-xs text-lc-muted mt-1">
                    by {shortKey(w.issuedByPubkey)} · {timeAgo(w.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Mod Log Tab */}
        {tab === 'log' && (
          <div className="mt-4 space-y-1" data-testid="log-tab">
            {log.length === 0 ? (
              <p className="text-sm text-lc-muted py-8 text-center">No moderation actions yet</p>
            ) : (
              <>
                {log.map((a) => <ModActionCard key={a.id} action={a} />)}
                {hasMoreLog && (
                  <button
                    onClick={handleLoadMoreLog}
                    className="w-full py-2 text-sm text-lc-muted hover:text-lc-white transition-colors mt-2"
                    data-testid="load-more-log"
                  >
                    Load more...
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Delete message confirm */}
      {deleteConfirm && (
        <ConfirmDialog
          title="Delete Message"
          message="This will soft-delete the message. It won't be visible to users."
          confirmLabel="Delete"
          onConfirm={() => handleDeleteMessage(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
