'use client';

import { useState, useEffect, useCallback } from 'react';
import { shortNpub } from '@/lib/mentions';

interface InviteMember {
  id: string;
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  joinedAt: string;
}

interface MyInvite {
  id: string;
  code: string;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  members?: InviteMember[];
}

interface CreditStatus {
  eligible: boolean;
  used: number;
  total: number;
  remaining: number;
  minDaysActive: number;
  memberSince: string | null;
  invites: MyInvite[];
}

interface MemberInviteCardProps {
  serverId: string;
  onClose?: () => void;
}

export default function MemberInviteCard({ serverId, onClose }: MemberInviteCardProps) {
  const [status, setStatus] = useState<CreditStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/servers/${serverId}/my-invites`);
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  const createInvite = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asMember: true }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setCreating(false);
    }
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="bg-lc-dark border border-lc-border rounded-xl p-5" data-testid="member-invite-card">
        <div className="lc-skeleton h-6 w-48 mb-3" />
        <div className="lc-skeleton h-10 w-full" />
      </div>
    );
  }

  if (!status || status.total <= 0) return null;

  const isExpired = (inv: MyInvite) =>
    inv.revokedAt != null ||
    (inv.expiresAt && new Date(inv.expiresAt) < new Date()) ||
    inv.uses >= inv.maxUses;

  const daysAsMember = status.memberSince
    ? Math.floor((Date.now() - new Date(status.memberSince).getTime()) / 86_400_000)
    : 0;
  const daysRemaining = Math.max(0, status.minDaysActive - daysAsMember);

  return (
    <div className="bg-lc-dark border border-lc-border rounded-xl p-5" data-testid="member-invite-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-lc-white">Invite Friends</h3>
        {onClose && (
          <button onClick={onClose} className="text-lc-muted hover:text-lc-white text-lg leading-none">&times;</button>
        )}
      </div>

      {!status.eligible ? (
        <p className="text-sm text-lc-muted" data-testid="invite-not-eligible">
          You can invite friends after being a member for {status.minDaysActive} days
          ({daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining).
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-lc-muted">
              {status.remaining}/{status.total} invite{status.total !== 1 ? 's' : ''} remaining
            </span>
            {status.remaining > 0 && (
              <button
                onClick={createInvite}
                disabled={creating}
                className="lc-pill-primary px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                data-testid="create-member-invite"
              >
                {creating ? 'Creating...' : 'Generate Invite Link'}
              </button>
            )}
          </div>

          {status.invites.length > 0 && (
            <div className="space-y-2" data-testid="member-invites-list">
              {status.invites.map((inv) => {
                const expired = isExpired(inv);
                const members = inv.members ?? [];
                return (
                  <div
                    key={inv.id}
                    className={`bg-lc-black border border-lc-border/60 rounded-lg px-3 py-2 ${expired ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <code className="text-xs text-lc-green font-mono">{inv.code.slice(0, 12)}...</code>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-lc-muted">{inv.uses}/{inv.maxUses} uses</span>
                        {!expired && (
                          <button
                            onClick={() => copyLink(inv.code)}
                            className="text-xs text-lc-muted hover:text-lc-green"
                          >
                            {copied === inv.code ? 'Copied!' : 'Copy'}
                          </button>
                        )}
                        {expired && (
                          <span className="text-[10px] text-lc-muted">Expired</span>
                        )}
                      </div>
                    </div>
                    {members.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {members.map((m) => (
                          <span key={m.id} className="text-[10px] text-lc-muted bg-lc-border/30 rounded-full px-2 py-0.5">
                            {m.displayName || m.nip05 || shortNpub(m.pubkey)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
