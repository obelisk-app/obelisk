'use client';

import { useState, useEffect } from 'react';

interface Invitation {
  id: string;
  code: string;
  createdBy: string;
  targetPubkey: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

interface InviteManagerProps {
  serverId: string;
}

export default function InviteManager({ serverId }: InviteManagerProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [targetPubkey, setTargetPubkey] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();
  }, [serverId]);

  const fetchInvitations = async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/invitations`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations);
      }
    } finally {
      setLoading(false);
    }
  };

  const createInvite = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxUses,
          expiresInHours,
          targetPubkey: targetPubkey.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setInvitations((prev) => [data.invitation, ...prev]);
        setTargetPubkey('');
      }
    } finally {
      setCreating(false);
    }
  };

  const copyInviteLink = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (inv: Invitation) =>
    (inv.expiresAt && new Date(inv.expiresAt) < new Date()) || inv.uses >= inv.maxUses;

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="lc-skeleton h-12" />)}</div>;
  }

  return (
    <div data-testid="invite-manager">
      {/* Create invite form */}
      <div className="bg-lc-dark border border-lc-border rounded-xl p-4 mb-4">
        <h4 className="text-sm font-semibold text-lc-white mb-3">Create Invitation</h4>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-lc-muted block mb-1">Max uses</label>
            <input
              type="number"
              min={1}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="invite-max-uses"
            />
          </div>
          <div>
            <label className="text-xs text-lc-muted block mb-1">Expires in (hours)</label>
            <input
              type="number"
              min={1}
              value={expiresInHours}
              onChange={(e) => setExpiresInHours(Number(e.target.value))}
              className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="invite-expires"
            />
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs text-lc-muted block mb-1">Target npub (optional — restrict to specific user)</label>
          <input
            type="text"
            value={targetPubkey}
            onChange={(e) => setTargetPubkey(e.target.value)}
            placeholder="Leave empty for anyone"
            className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
            data-testid="invite-target"
          />
        </div>
        <button
          onClick={createInvite}
          disabled={creating}
          className="lc-pill-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
          data-testid="create-invite-btn"
        >
          {creating ? 'Creating...' : 'Generate Invite'}
        </button>
      </div>

      {/* Invitation list */}
      <div className="space-y-2">
        {invitations.length === 0 && (
          <p className="text-sm text-lc-muted text-center py-4">No invitations yet</p>
        )}
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className={`flex items-center justify-between bg-lc-dark border border-lc-border rounded-xl px-4 py-3 ${
              isExpired(inv) ? 'opacity-50' : ''
            }`}
            data-testid="invite-row"
          >
            <div className="min-w-0 flex-1">
              <code className="text-sm text-lc-green font-mono">{inv.code.slice(0, 12)}...</code>
              <div className="flex gap-3 mt-1 text-xs text-lc-muted">
                <span>{inv.uses}/{inv.maxUses} uses</span>
                {inv.expiresAt && (
                  <span>Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                )}
                {inv.targetPubkey && (
                  <span>For: {inv.targetPubkey.slice(0, 8)}...</span>
                )}
              </div>
            </div>
            {!isExpired(inv) && (
              <button
                onClick={() => copyInviteLink(inv.code)}
                className="text-xs text-lc-muted hover:text-lc-green transition-colors ml-2"
                data-testid="copy-invite-btn"
              >
                {copied === inv.code ? 'Copied!' : 'Copy link'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
