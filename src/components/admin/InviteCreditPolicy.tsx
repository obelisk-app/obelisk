'use client';

import { useState } from 'react';

interface InviteCreditPolicyProps {
  serverId: string;
  invitesPerUser: number;
  inviteExpiryHours: number;
  minDaysActive: number;
  onSaved?: () => void;
}

export default function InviteCreditPolicy({
  serverId,
  invitesPerUser,
  inviteExpiryHours,
  minDaysActive,
  onSaved,
}: InviteCreditPolicyProps) {
  const [perUser, setPerUser] = useState(invitesPerUser);
  const [expiryHours, setExpiryHours] = useState(inviteExpiryHours);
  const [minDays, setMinDays] = useState(minDaysActive);
  const [saving, setSaving] = useState(false);
  const enabled = perUser > 0;

  const hasChanges =
    perUser !== invitesPerUser ||
    expiryHours !== inviteExpiryHours ||
    minDays !== minDaysActive;

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/access`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitesPerUser: perUser,
          inviteExpiryHours: expiryHours,
          minDaysActive: minDays,
        }),
      });
      if (res.ok) onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = () => {
    if (enabled) {
      setPerUser(0);
    } else {
      setPerUser(invitesPerUser > 0 ? invitesPerUser : 3);
    }
  };

  return (
    <section
      className="bg-lc-dark border border-lc-border rounded-xl p-5"
      data-testid="invite-credit-policy"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-lc-white">Member Invites</h3>
        <button
          onClick={toggleEnabled}
          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
            enabled
              ? 'border-lc-green text-lc-green'
              : 'border-lc-border text-lc-muted hover:text-lc-white'
          }`}
          data-testid="member-invites-toggle"
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>
      <p className="text-xs text-lc-muted mb-4">
        Let established members generate their own invite links. Each member
        gets a limited number of single-use, auto-expiring invites.
      </p>

      {enabled && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-lc-muted block mb-1">Invites per member</label>
            <input
              type="number"
              min={1}
              value={perUser}
              onChange={(e) => setPerUser(Math.max(1, Number(e.target.value)))}
              className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="invites-per-user"
            />
          </div>
          <div>
            <label className="text-xs text-lc-muted block mb-1">Expire after (hours)</label>
            <input
              type="number"
              min={1}
              value={expiryHours}
              onChange={(e) => setExpiryHours(Math.max(1, Number(e.target.value)))}
              className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="invite-expiry-hours"
            />
          </div>
          <div>
            <label className="text-xs text-lc-muted block mb-1">Min days as member</label>
            <input
              type="number"
              min={0}
              value={minDays}
              onChange={(e) => setMinDays(Math.max(0, Number(e.target.value)))}
              className="w-full px-2 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="min-days-active"
            />
          </div>
        </div>
      )}

      {hasChanges && (
        <button
          onClick={save}
          disabled={saving}
          className="lc-pill-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
          data-testid="save-credit-policy"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      )}
    </section>
  );
}
