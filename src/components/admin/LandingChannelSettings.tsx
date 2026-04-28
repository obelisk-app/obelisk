'use client';

import { useEffect, useState } from 'react';
import { emojiForOptionText } from '@/components/chat/ChannelEmoji';

interface TextChannelOption {
  id: string;
  name: string;
  emoji: string | null;
}

interface LandingChannelSettingsProps {
  serverId: string;
  currentChannelId: string | null;
  onSaved?: () => void | Promise<void>;
}

interface AdminChannel {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
}

interface CategoriesResponse {
  categories: Array<{ id: string; name: string; channels: AdminChannel[] }>;
  uncategorizedChannels: AdminChannel[];
}

export default function LandingChannelSettings({
  serverId,
  currentChannelId,
  onSaved,
}: LandingChannelSettingsProps) {
  const [channels, setChannels] = useState<TextChannelOption[]>([]);
  const [channelId, setChannelId] = useState<string>(currentChannelId ?? '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = channelId !== (currentChannelId ?? '');

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/server?serverId=${encodeURIComponent(serverId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            landingChannelId: channelId === '' ? null : channelId,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to save');
        return;
      }
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      await onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/categories?serverId=${encodeURIComponent(serverId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<CategoriesResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const fromCategories = data.categories.flatMap((c) => c.channels);
        const all = [...fromCategories, ...data.uncategorizedChannels];
        setChannels(
          all
            .filter((c) => c.type === 'text')
            .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  useEffect(() => {
    setChannelId(currentChannelId ?? '');
  }, [currentChannelId]);

  const disabled = channelId === '';

  return (
    <div
      className="rounded-xl border border-lc-border bg-lc-dark p-6 space-y-4"
      data-testid="landing-channel-settings"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-lc-white">
          First-visit landing channel
        </h3>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            disabled
              ? 'bg-lc-border/30 border-lc-border text-lc-muted'
              : 'bg-lc-green/15 border-lc-green/40 text-lc-green'
          }`}
          data-testid="landing-channel-status"
        >
          {disabled ? 'Disabled' : 'Enabled'}
        </span>
      </div>
      <p className="text-xs text-lc-muted max-w-md">
        The channel brand-new members land on the first time they open this
        server (e.g. an &ldquo;empezá acá&rdquo; channel with a pinned
        summary). Only applied once per member. This is <strong>not</strong>{' '}
        the welcome-bot channel — that one posts an automated greeting and is
        configured separately above.
      </p>

      <div>
        <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
          Landing channel
        </label>
        <select
          name="landingChannelId"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          data-testid="landing-channel-select"
          className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
        >
          <option value="">— Disabled —</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{emojiForOptionText(c.emoji) ? `${emojiForOptionText(c.emoji)} ` : ''}
              {c.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-lc-muted mt-1">
          Only text channels from this server.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-lc-border/60">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          data-testid="landing-channel-save"
          className={`px-5 py-2 rounded-full font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
            dirty
              ? 'bg-lc-green text-lc-black hover:brightness-110'
              : 'bg-lc-border text-lc-muted'
          }`}
        >
          {saving ? 'Saving…' : 'Save landing channel'}
        </button>
        {justSaved && <span className="text-xs text-lc-green">✓ Saved</span>}
        {dirty && !saving && (
          <span className="text-xs text-lc-muted">Unsaved changes</span>
        )}
        {error && (
          <span className="text-xs text-red-400" data-testid="landing-channel-error">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
