'use client';

import { useEffect, useState, useCallback } from 'react';
import AccessPanel from './AccessPanel';
import InviteManager from './InviteManager';

type JoinMode = 'open' | 'invite-only' | 'wot';

interface AccessControlPanelProps {
  serverId: string;
  isOwner: boolean;
  /** Called whenever the access mode changes so the parent can refresh server state. */
  onModeChanged?: () => void;
}

interface ServerAccessConfig {
  joinMode: 'open' | 'invite-only';
  wotEnabled: boolean;
  referentePubkey: string | null;
}

/**
 * Single coherent "Access Control" tab that consolidates what used to be
 * three different tabs (Access, Invitations, and the Access Control section
 * inside Settings). Owners pick one of three join modes; the relevant
 * controls fold in/out below.
 *
 *   - Open         → anyone can join
 *   - Invite-Only  → must redeem an invite link
 *   - Web of Trust → must be followed by the referente or on the override list
 */
export default function AccessControlPanel({ serverId, isOwner, onModeChanged }: AccessControlPanelProps) {
  const [config, setConfig] = useState<ServerAccessConfig | null>(null);
  const [saving, setSaving] = useState<JoinMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/servers/${serverId}/access`);
    if (res.ok) {
      const data = await res.json();
      setConfig({
        joinMode: data.joinMode ?? 'open',
        wotEnabled: !!data.wotEnabled,
        referentePubkey: data.referentePubkey ?? null,
      });
    } else {
      setError('Failed to load access config');
    }
  }, [serverId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const currentMode: JoinMode = config?.wotEnabled
    ? 'wot'
    : config?.joinMode === 'invite-only'
      ? 'invite-only'
      : 'open';

  const switchMode = async (mode: JoinMode) => {
    if (!config || mode === currentMode || !isOwner) return;
    setSaving(mode);
    setError(null);

    try {
      // Update WoT toggle
      const wotShouldBeOn = mode === 'wot';
      if (wotShouldBeOn !== config.wotEnabled) {
        if (wotShouldBeOn && !config.referentePubkey) {
          setError('Set a Referente pubkey below before enabling Web of Trust.');
          return;
        }
        const res = await fetch(`/api/servers/${serverId}/access`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wotEnabled: wotShouldBeOn }),
        });
        if (!res.ok) {
          setError('Failed to update WoT mode');
          return;
        }
      }

      // Update joinMode (only meaningful when WoT is OFF)
      if (mode !== 'wot') {
        const newJoinMode = mode === 'invite-only' ? 'invite-only' : 'open';
        if (newJoinMode !== config.joinMode) {
          const res = await fetch(`/api/admin/server/join-mode?serverId=${encodeURIComponent(serverId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ joinMode: newJoinMode }),
          });
          if (!res.ok) {
            setError('Failed to update join mode');
            return;
          }
        }
      }

      await loadConfig();
      onModeChanged?.();
    } finally {
      setSaving(null);
    }
  };

  if (!config) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="lc-skeleton h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  const modeOptions: { id: JoinMode; label: string; description: string }[] = [
    {
      id: 'open',
      label: 'Open',
      description: 'Anyone can join by logging in with Nostr.',
    },
    {
      id: 'invite-only',
      label: 'Invite Only',
      description: 'New users must redeem an invite link to join.',
    },
    {
      id: 'wot',
      label: 'Web of Trust',
      description:
        'Only npubs followed by the referente (plus manual overrides and valid invites) can join.',
    },
  ];

  return (
    <div className="space-y-6" data-testid="access-control-panel">
      {error && (
        <div className="rounded-lg border border-red-600/40 bg-red-600/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Join mode selector — single source of truth for who can get in */}
      <section className="bg-lc-dark border border-lc-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-lc-white mb-1">Join Mode</h3>
        <p className="text-xs text-lc-muted mb-4">
          Choose how new users gain access to this server. This is the only
          access-control switch — Web of Trust replaces (rather than augments)
          the open / invite-only setting when active.
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          {modeOptions.map((opt) => {
            const active = currentMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => switchMode(opt.id)}
                disabled={!isOwner || saving !== null}
                data-testid={`mode-${opt.id}`}
                className={`text-left rounded-xl border p-4 transition-colors disabled:opacity-50 ${
                  active
                    ? 'border-lc-green bg-lc-green/10'
                    : 'border-lc-border hover:border-lc-border/80 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-semibold ${active ? 'text-lc-green' : 'text-lc-white'}`}>
                    {opt.label}
                  </span>
                  {active && (
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-lc-green">
                      Active
                    </span>
                  )}
                  {saving === opt.id && (
                    <span className="text-[10px] text-lc-muted">Saving…</span>
                  )}
                </div>
                <p className="text-xs text-lc-muted leading-relaxed">{opt.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* WoT settings — referente, refresh, entries, overrides, invite credits.
          Always shown so admins can configure them ahead of switching to WoT mode.
          The existing AccessPanel already includes everything. */}
      <AccessPanel serverId={serverId} isOwner={isOwner} />

      {/* Active invitations + create form. Shown for all modes since invites
          remain useful as targeted invites even in WoT mode. */}
      <section className="bg-lc-dark border border-lc-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-lc-white mb-1">Invitations</h3>
        <p className="text-xs text-lc-muted mb-4">
          Generate invite links for users who aren&apos;t in the WoT or for
          out-of-band onboarding. Each link is single-use by default.
        </p>
        <InviteManager serverId={serverId} />
      </section>
    </div>
  );
}
