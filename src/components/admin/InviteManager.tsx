'use client';

import { useState, useEffect } from 'react';
import { shortNpub } from '@/lib/mentions';

interface InvitationMember {
  id: string;
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  joinedAt: string;
}

interface Invitation {
  id: string;
  code: string;
  createdBy: string;
  targetPubkey: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  /** Members who actually joined through this invite. */
  members?: InvitationMember[];
}

interface InviteManagerProps {
  serverId: string;
}

export default function InviteManager({ serverId }: InviteManagerProps) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [targetPubkey, setTargetPubkey] = useState('');
  const [customCode, setCustomCode] = useState('');
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
          customCode: customCode.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setInvitations((prev) => [data.invitation, ...prev]);
        setTargetPubkey('');
        setCustomCode('');
      } else {
        alert(data.error || 'Failed to create invite');
      }
    } catch (e) {
      alert('Network error while creating invite');
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

  // Soft-revoke: the row stays in the list (grayed out) so admins can still
  // see who joined via this link historically. The API sets revokedAt and
  // the redeem endpoint rejects revoked invites with 410.
  const revokeInvite = async (inv: Invitation) => {
    if (!window.confirm(`Revoke invite ${inv.code.slice(0, 12)}...? Existing members who joined with it stay, but the link will stop working.`)) {
      return;
    }
    setRevokingId(inv.id);
    try {
      const res = await fetch(`/api/servers/${serverId}/invitations/${inv.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = await res.json();
        setInvitations((prev) =>
          prev.map((x) => (x.id === inv.id ? { ...x, ...data.invitation } : x))
        );
      }
    } finally {
      setRevokingId(null);
    }
  };

  const isRevoked = (inv: Invitation) => inv.revokedAt != null;
  const isExpired = (inv: Invitation) =>
    (inv.expiresAt && new Date(inv.expiresAt) < new Date()) || inv.uses >= inv.maxUses;
  const isInactive = (inv: Invitation) => isRevoked(inv) || isExpired(inv);

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
            className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none mb-3"
            data-testid="invite-target"
          />
          <label className="text-xs text-lc-muted block mb-1">Custom Link Code (optional — e.g. "obelisk" for /invite/obelisk)</label>
          <input
            type="text"
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            placeholder="Leave empty for random code"
            className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
            data-testid="invite-custom-code"
          />
          <p className="text-[10px] text-amber-500/80 mt-1.5 leading-tight">
            Note: Custom codes are easily guessed. Only use this if you want your server to be publicly accessible.
          </p>
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
        {invitations.map((inv) => {
          const members = inv.members ?? [];
          const revoked = isRevoked(inv);
          const expired = isExpired(inv);
          return (
            <div
              key={inv.id}
              className={`bg-lc-dark border border-lc-border rounded-xl px-4 py-3 ${
                isInactive(inv) ? 'opacity-60' : ''
              }`}
              data-testid="invite-row"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm text-lc-green font-mono">{inv.code.slice(0, 12)}...</code>
                    {revoked && (
                      <span
                        className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30"
                        data-testid="invite-revoked-badge"
                      >
                        Revoked
                      </span>
                    )}
                    {!revoked && expired && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-lc-border/60 text-lc-muted">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-lc-muted flex-wrap">
                    <span>{inv.uses}/{inv.maxUses} uses</span>
                    <span>By {shortNpub(inv.createdBy)}</span>
                    {inv.expiresAt && (
                      <span>Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                    )}
                    {inv.targetPubkey && (
                      <span>For: {inv.targetPubkey.slice(0, 8)}...</span>
                    )}
                    {revoked && inv.revokedBy && (
                      <span data-testid="invite-revoked-by">
                        Revoked by {shortNpub(inv.revokedBy)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-2 shrink-0">
                  {!isInactive(inv) && (
                    <button
                      onClick={() => copyInviteLink(inv.code)}
                      className="text-xs text-lc-muted hover:text-lc-green transition-colors"
                      data-testid="copy-invite-btn"
                    >
                      {copied === inv.code ? 'Copied!' : 'Copy link'}
                    </button>
                  )}
                  {!revoked && (
                    <button
                      onClick={() => revokeInvite(inv)}
                      disabled={revokingId === inv.id}
                      className="text-xs text-lc-muted hover:text-red-400 transition-colors disabled:opacity-50"
                      data-testid="revoke-invite-btn"
                    >
                      {revokingId === inv.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </div>
              </div>

              {/* Joined members — only shown when at least one user came in via this link.
                  Intentionally rendered even for revoked invites so the admin panel keeps
                  the historical record of who used this link. */}
              {members.length > 0 && (
                <div
                  className="mt-3 pt-3 border-t border-lc-border/60"
                  data-testid="invite-joined-members"
                >
                  <p className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-2">
                    Joined via this link
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {members.map((m) => {
                      const short = shortNpub(m.pubkey);
                      const label = m.displayName || m.nip05 || short;
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 px-2 py-1 rounded-full bg-lc-black border border-lc-border/60"
                          title={`${label} • joined ${new Date(m.joinedAt).toLocaleString()}`}
                        >
                          {m.picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.picture}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-lc-olive flex items-center justify-center text-[10px] font-bold text-lc-green">
                              {label[0]?.toUpperCase() ?? '?'}
                            </div>
                          )}
                          <span className="text-xs text-lc-white truncate max-w-[140px]">
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
