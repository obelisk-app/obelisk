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
  const [reports, setReports] = useState<Report[]>([]);
  const [mutes, setMutes] = useState<MuteEntry[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [log, setLog] = useState<ModAction[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
          router.push('/chat');
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

  const fetchLog = useCallback(async () => {
    const res = await fetch('/api/moderation/log');
    if (res.ok) setLog(await res.json());
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
          <div className="mt-4 space-y-2" data-testid="mutes-tab">
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
          <div className="mt-4 space-y-2" data-testid="warnings-tab">
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
              log.map((a) => <ModActionCard key={a.id} action={a} />)
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
