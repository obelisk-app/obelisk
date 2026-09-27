'use client';

/**
 * `/play` and `/app`: pick an app from the ACTIVE relay's catalog and open it
 * in this channel. Replaces the games picker, which listed three hardcoded
 * games and their options. Options now live in each app (its own lobby).
 *
 * Picking publishes the session `create` — pinning the app's exact files —
 * posts the `[[app:<id>]]` marker as a chat message, and opens the frame.
 *
 * Every entry shows its author, because an app is written by whoever could
 * publish to this relay; the title alone says nothing about who made it.
 */
import { useEffect, useMemo, useState } from 'react';

import ModalShell from '@/components/ModalShell';
import { useTranslation } from '@/i18n/context';
import { CloseIcon } from '@/components/ui/icons';
import { subscribeCatalog } from '@/lib/apps/catalog';
import type { AppManifest } from '@/lib/apps/manifest';
import { appMarker } from '@/lib/apps/session';
import { publishSessionCreate } from '@/lib/apps/transport';
import { useAuthor } from '@/lib/social/useAuthor';
import { shortNpubLabel } from '@/lib/short-npub';
import { useAppsStore } from '@/store/apps';

import AppIcon from './AppIcon';

function Author({ pubkey }: { pubkey: string }) {
  const a = useAuthor(pubkey);
  return <>{a.nip05 || a.displayName || a.name || shortNpubLabel(pubkey)}</>;
}

export default function AppPicker({
  channelId,
  filter,
  onClose,
  onPostMarker,
}: {
  channelId: string;
  /** `game` for /play; omitted for /app. */
  filter?: string;
  onClose: () => void;
  onPostMarker: (marker: string) => void;
}) {
  const [apps, setApps] = useState<AppManifest[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setOpen = useAppsStore((s) => s.setOpenSession);
  const { t } = useTranslation();

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    void subscribeCatalog(setApps).then((fn) => { if (cancelled) fn(); else unsub = fn; });
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const shown = useMemo(
    () => (apps ?? []).filter((m) => !filter || m.types.includes(filter)),
    [apps, filter],
  );

  async function open(m: AppManifest) {
    setBusy(m.address);
    setError(null);
    try {
      const id = await publishSessionCreate(channelId, m);
      onPostMarker(appMarker(id));
      setOpen(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('apps.openFailed'));
      setBusy(null);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      testId="app-picker"
      panelClassName="w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto rounded-xl border border-lc-border bg-lc-dark p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-lc-white">{filter === 'game' ? t('apps.pickerGameTitle') : t('apps.pickerAppTitle')}</h2>
        <button type="button" onClick={onClose} aria-label={t('common.close')}
          className="rounded-lg border border-lc-border bg-lc-card/60 p-1.5 text-lc-white hover:border-lc-muted">
          <CloseIcon size={14} />
        </button>
      </div>
      <p className="mt-1 text-[11px] text-lc-muted">{t('apps.pickerIntro')}</p>

      {apps === null && <div className="lc-skeleton mt-4 h-24 w-full rounded-lg" data-testid="app-picker-loading" />}

      {apps !== null && shown.length === 0 && (
        <p className="mt-6 text-center text-xs text-lc-muted" data-testid="app-picker-empty">
          {filter === 'game' ? t('apps.pickerNoGames') : t('apps.pickerNoApps')}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {shown.map((m) => (
          <li key={m.address}>
            <button
              type="button"
              disabled={!!busy || !m.runnable}
              onClick={() => void open(m)}
              className="flex w-full items-start gap-3 rounded-lg border border-lc-border bg-lc-card/60 p-3 text-left transition-colors hover:border-lc-green/60 disabled:opacity-50"
              data-testid={`app-option-${m.slug}`}
            >
              <AppIcon manifest={m} size={56} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-lc-white">{m.title}</span>
                {m.description && <span className="mt-0.5 block text-[11px] text-lc-muted">{m.description}</span>}
                <span className="mt-1 block truncate text-[10px] text-lc-muted">
                  {t('apps.by')} <Author pubkey={m.author} />
                  {m.players && ` · ${t('apps.players').replace('{min}', String(m.players.min)).replace('{max}', String(m.players.max))}`}
                  {!m.runnable && ` · ${t('apps.needsNewer')}`}
                </span>
              </span>
              {busy === m.address && <span className="lc-spinner h-4 w-4 shrink-0" />}
            </button>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </ModalShell>
  );
}
