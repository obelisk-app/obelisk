'use client';

import { useEffect, useMemo, useState } from 'react';
import { getWelcomeTemplate } from '@/lib/welcome-templates';
import type { Locale } from '@/i18n';

interface TextChannelOption {
  id: string;
  name: string;
  emoji: string | null;
}

interface WelcomeBotSettingsProps {
  serverId: string;
  serverName: string;
  currentChannelId: string | null;
  currentLocale: string | null;
  /** Most recent member (for preview avatar/name); optional. */
  previewMember?: { displayName: string | null; picture: string | null } | null;
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

export default function WelcomeBotSettings({
  serverId,
  serverName,
  currentChannelId,
  currentLocale,
  previewMember,
}: WelcomeBotSettingsProps) {
  const [channels, setChannels] = useState<TextChannelOption[]>([]);
  const [channelId, setChannelId] = useState<string>(currentChannelId ?? '');
  const [locale, setLocale] = useState<string>(currentLocale ?? 'es');

  // Fetch text channels for the dropdown. Reuses /api/admin/categories,
  // which is the same endpoint the ChannelManager uses.
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
      .catch(() => {
        /* non-fatal — dropdown will just be empty */
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  // Re-sync local state when props change (e.g. after saving).
  useEffect(() => {
    setChannelId(currentChannelId ?? '');
  }, [currentChannelId]);
  useEffect(() => {
    setLocale(currentLocale ?? 'es');
  }, [currentLocale]);

  const previewLocale: Locale = locale === 'en' ? 'en' : 'es';
  const previewDisplayName =
    previewMember?.displayName || (previewLocale === 'en' ? 'new_member' : 'nuevo_miembro');
  const previewBannerUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('name', previewDisplayName);
    if (previewMember?.picture) params.set('picture', previewMember.picture);
    return `/api/welcome-banner?${params.toString()}`;
  }, [previewDisplayName, previewMember?.picture]);
  const previewContent = useMemo(
    () =>
      getWelcomeTemplate(previewLocale, {
        displayName: previewDisplayName,
        bannerUrl: previewBannerUrl,
        serverName,
      }),
    [previewLocale, previewDisplayName, previewBannerUrl, serverName]
  );

  const disabled = channelId === '';

  return (
    <div
      className="rounded-xl border border-lc-green/30 bg-lc-green/[0.03] p-6 space-y-5"
      data-testid="welcome-bot-settings"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-lc-white">Welcome Bot</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                disabled
                  ? 'bg-lc-border/30 border-lc-border text-lc-muted'
                  : 'bg-lc-green/15 border-lc-green/40 text-lc-green'
              }`}
              data-testid="welcome-bot-status"
            >
              {disabled ? 'Disabled' : 'Enabled'}
            </span>
          </div>
          <p className="text-xs text-lc-muted mt-1.5 max-w-md">
            Automatically greets every new member in the channel you pick, in
            the language you choose. Set the channel to &ldquo;Disabled&rdquo;
            to turn the bot off completely.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
            Welcome channel
          </label>
          <select
            name="welcomeChannelId"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            data-testid="welcome-channel-select"
            className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
          >
            <option value="">— Disabled —</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                #{c.emoji ? `${c.emoji} ` : ''}
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-lc-muted mt-1">
            Only text channels from this server.
          </p>
        </div>

        <div>
          <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
            Bot language
          </label>
          <select
            name="welcomeLocale"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            disabled={disabled}
            data-testid="welcome-locale-select"
            className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors disabled:opacity-50"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
          <p className="text-[11px] text-lc-muted mt-1">
            Determines the greeting copy.
          </p>
        </div>
      </div>

      <div>
        <div className="text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
          Preview
        </div>
        {disabled ? (
          <div
            className="rounded-lg border border-dashed border-lc-border bg-lc-black/60 p-4 text-xs text-lc-muted"
            data-testid="welcome-preview-disabled"
          >
            Welcome bot is disabled. Pick a channel above to enable it.
          </div>
        ) : (
          <div
            className="rounded-lg border border-lc-border bg-lc-black/60 p-4 space-y-2"
            data-testid="welcome-preview"
          >
            <pre className="whitespace-pre-wrap break-words text-xs text-lc-white font-sans">
              {previewContent}
            </pre>
            <p className="text-[11px] text-lc-muted pt-1 border-t border-lc-border/60">
              Click <span className="text-lc-green font-medium">Save Changes</span> below to apply.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
