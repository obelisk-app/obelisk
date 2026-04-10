'use client';

import { useState } from 'react';

export interface InviteCredits {
  eligible: boolean;
  available: number;
  used: number;
  limit: number;
  messageCount: number;
  daysActive: number;
  minMessages: number;
  minDaysActive: number;
  reasons: string[];
  adminBypass?: boolean;
}

interface InviteCreditsCardProps {
  serverId: string;
  serverName: string;
  credits: InviteCredits | null;
  onMinted?: () => void;
}

export default function InviteCreditsCard({
  serverId,
  serverName,
  credits,
  onMinted,
}: InviteCreditsCardProps) {
  const [minting, setMinting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (!credits) {
    return (
      <div className="lc-card p-4">
        <p className="text-sm text-lc-muted">Could not load credits for {serverName}.</p>
      </div>
    );
  }

  const mintInvite = async () => {
    setMinting(true);
    setError(null);
    setLink(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPubkey: target.trim() || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        const url = `${window.location.origin}/invite/${data.invitation.code}`;
        setLink(url);
        setTarget('');
        onMinted?.();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to mint invite');
      }
    } finally {
      setMinting(false);
    }
  };

  const adminBypass = credits.adminBypass;

  return (
    <div className="lc-card p-4" data-testid="invite-credits-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-lc-white">{serverName}</h3>
        {adminBypass ? (
          <span className="text-xs px-2 py-0.5 rounded-full bg-lc-green/10 text-lc-green border border-lc-green/30">
            Admin · unlimited
          </span>
        ) : credits.eligible ? (
          <span className="text-xs text-lc-green">
            {credits.available}/{credits.limit} available
          </span>
        ) : (
          <span className="text-xs text-lc-muted">Not yet eligible</span>
        )}
      </div>

      {!adminBypass && !credits.eligible && (
        <div className="space-y-2 mb-3">
          <div className="text-xs text-lc-muted">
            <span className="text-lc-white font-medium">{credits.messageCount}</span>/
            {credits.minMessages} messages
          </div>
          <div className="h-1 rounded-full bg-lc-border overflow-hidden">
            <div
              className="h-full bg-lc-green"
              style={{
                width: `${Math.min(100, (credits.messageCount / Math.max(1, credits.minMessages)) * 100)}%`,
              }}
            />
          </div>
          <div className="text-xs text-lc-muted">
            <span className="text-lc-white font-medium">{credits.daysActive}</span>/
            {credits.minDaysActive} days active
          </div>
          <div className="h-1 rounded-full bg-lc-border overflow-hidden">
            <div
              className="h-full bg-lc-green"
              style={{
                width: `${Math.min(100, (credits.daysActive / Math.max(1, credits.minDaysActive)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {(adminBypass || (credits.eligible && credits.available > 0)) && (
        <>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="lc-pill-primary px-4 py-2 text-sm font-medium w-full"
              data-testid="open-mint-form-btn"
            >
              Mint invite
            </button>
          )}
          {showForm && (
            <div className="space-y-2">
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Target npub (optional)"
                className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm font-mono focus:border-lc-green focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={mintInvite}
                  disabled={minting}
                  className="lc-pill-primary px-4 py-2 text-sm font-medium flex-1 disabled:opacity-50"
                  data-testid="mint-invite-btn"
                >
                  {minting ? 'Minting...' : 'Generate link'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm text-lc-muted hover:text-lc-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!adminBypass && credits.eligible && credits.available === 0 && (
        <p className="text-xs text-lc-muted text-center py-2">
          You've used all your invites for this server.
        </p>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      {link && (
        <div className="mt-3 p-2 rounded-lg bg-lc-black border border-lc-green/40">
          <p className="text-xs text-lc-muted mb-1">Invite link:</p>
          <code className="text-xs text-lc-green font-mono break-all">{link}</code>
          <button
            onClick={() => navigator.clipboard.writeText(link)}
            className="mt-2 text-xs text-lc-muted hover:text-lc-green"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}
