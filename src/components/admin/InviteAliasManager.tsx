'use client';

import { useEffect, useState } from 'react';
import { shortNpub } from '@/lib/mentions';

interface InviteAlias {
  id: string;
  slug: string;
  serverId: string;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  serverId: string;
}

export default function InviteAliasManager({ serverId }: Props) {
  const [aliases, setAliases] = useState<InviteAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSlug, setNewSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/invite-aliases`);
        if (res.ok) {
          const data = await res.json();
          setAliases(data.aliases);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [serverId]);

  const create = async () => {
    setError('');
    setCreating(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/invite-aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create alias');
      } else {
        setAliases((prev) => [data.alias, ...prev]);
        setNewSlug('');
      }
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (alias: InviteAlias) => {
    setBusyId(alias.id);
    try {
      const res = await fetch(
        `/api/servers/${serverId}/invite-aliases/${alias.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: !alias.enabled }),
        }
      );
      const data = await res.json();
      if (res.ok) {
        setAliases((prev) => prev.map((a) => (a.id === alias.id ? data.alias : a)));
      }
    } finally {
      setBusyId(null);
    }
  };

  const rename = async (alias: InviteAlias) => {
    if (!renameValue.trim() || renameValue === alias.slug) {
      setRenameId(null);
      return;
    }
    setBusyId(alias.id);
    setError('');
    try {
      const res = await fetch(
        `/api/servers/${serverId}/invite-aliases/${alias.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: renameValue }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to rename');
      } else {
        setAliases((prev) => prev.map((a) => (a.id === alias.id ? data.alias : a)));
        setRenameId(null);
        setRenameValue('');
      }
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (alias: InviteAlias) => {
    if (!window.confirm(`Delete alias /invite/${alias.slug}?`)) return;
    setBusyId(alias.id);
    try {
      const res = await fetch(
        `/api/servers/${serverId}/invite-aliases/${alias.id}`,
        { method: 'DELETE' }
      );
      if (res.ok) setAliases((prev) => prev.filter((a) => a.id !== alias.id));
    } finally {
      setBusyId(null);
    }
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/invite/${slug}`;
    navigator.clipboard.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="lc-skeleton h-12" />
        ))}
      </div>
    );
  }

  return (
    <div data-testid="invite-alias-manager">
      <div className="bg-lc-dark border border-lc-border rounded-xl p-4 mb-4">
        <h4 className="text-sm font-semibold text-lc-white mb-1">
          Permanent Invite Aliases
        </h4>
        <p className="text-xs text-lc-muted mb-3">
          Editable, reusable named links (e.g. <code>/invite/obelisk</code>). Work only
          while this server is open to new members.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="slug (e.g. obelisk)"
            className="flex-1 px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
            data-testid="alias-slug-input"
          />
          <button
            onClick={create}
            disabled={creating || !newSlug.trim()}
            className="lc-pill-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
            data-testid="alias-create-btn"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
        {error && (
          <p className="text-red-400 text-xs mt-2" data-testid="alias-error">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {aliases.length === 0 && (
          <p className="text-sm text-lc-muted text-center py-4">No aliases yet</p>
        )}
        {aliases.map((a) => (
          <div
            key={a.id}
            className={`bg-lc-dark border border-lc-border rounded-xl px-4 py-3 ${a.enabled ? '' : 'opacity-60'}`}
            data-testid="alias-row"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                {renameId === a.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="flex-1 px-2 py-1 rounded bg-lc-black border border-lc-border text-lc-white text-sm"
                      data-testid="alias-rename-input"
                    />
                    <button
                      onClick={() => rename(a)}
                      disabled={busyId === a.id}
                      className="text-xs text-lc-green hover:underline"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setRenameId(null);
                        setRenameValue('');
                      }}
                      className="text-xs text-lc-muted hover:text-lc-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <code className="text-sm text-lc-green font-mono">/invite/{a.slug}</code>
                    <div className="flex gap-3 mt-1 text-xs text-lc-muted flex-wrap">
                      <span>{a.enabled ? 'Active' : 'Disabled'}</span>
                      <span>By {shortNpub(a.createdBy)}</span>
                    </div>
                  </>
                )}
              </div>
              {renameId !== a.id && (
                <div className="flex items-center gap-3 ml-2 shrink-0">
                  <button
                    onClick={() => copyLink(a.slug)}
                    className="text-xs text-lc-muted hover:text-lc-green transition-colors"
                    data-testid="alias-copy-btn"
                  >
                    {copied === a.slug ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => {
                      setRenameId(a.id);
                      setRenameValue(a.slug);
                    }}
                    className="text-xs text-lc-muted hover:text-lc-white"
                    data-testid="alias-rename-btn"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => toggle(a)}
                    disabled={busyId === a.id}
                    className="text-xs text-lc-muted hover:text-lc-white disabled:opacity-50"
                    data-testid="alias-toggle-btn"
                  >
                    {a.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => remove(a)}
                    disabled={busyId === a.id}
                    className="text-xs text-lc-muted hover:text-red-400 disabled:opacity-50"
                    data-testid="alias-delete-btn"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
