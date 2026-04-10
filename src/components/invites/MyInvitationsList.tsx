'use client';

import { useState } from 'react';

interface MyInvitation {
  id: string;
  code: string;
  serverId: string;
  targetPubkey: string | null;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
  server: { id: string; name: string; icon: string | null };
}

interface MyInvitationsListProps {
  invitations: MyInvitation[];
}

export default function MyInvitationsList({ invitations }: MyInvitationsListProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (code: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  if (invitations.length === 0) {
    return (
      <p className="text-sm text-lc-muted py-4 text-center">
        You haven't minted any invitations yet.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid="my-invitations-list">
      {invitations.map((inv) => {
        const expired = (inv.expiresAt && new Date(inv.expiresAt) < new Date()) || inv.uses >= inv.maxUses;
        return (
          <div
            key={inv.id}
            className={`flex items-center justify-between bg-lc-dark border border-lc-border rounded-xl px-4 py-3 ${expired ? 'opacity-50' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-lc-muted">{inv.server.name}</p>
              <code className="text-sm text-lc-green font-mono">{inv.code.slice(0, 12)}...</code>
              <div className="flex gap-3 mt-1 text-xs text-lc-muted">
                <span>{inv.uses}/{inv.maxUses} uses</span>
                {inv.expiresAt && <span>Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>}
              </div>
            </div>
            {!expired && (
              <button
                onClick={() => copy(inv.code)}
                className="text-xs text-lc-muted hover:text-lc-green ml-2"
              >
                {copied === inv.code ? 'Copied!' : 'Copy link'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
