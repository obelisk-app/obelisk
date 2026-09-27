'use client';

/**
 * The chat card for an `[[app:<id>]]` (or legacy `[[game:<id>]]`) marker.
 *
 * Deliberately NOT a live board: running app code per card would mean an
 * iframe per message. The card is drawn by the host from what the host knows
 * — the manifest's title, who's in, whether it's closed, and the one-line
 * `status` the app publishes — and opens the real thing in AppFrameModal.
 */
import { memo, useEffect, useLayoutEffect, useState } from 'react';

import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n/context';
import { AppsIcon, GamepadIcon } from '@/components/ui/icons';
import { useSessionSummary } from '@/hooks/chat/useAppSessions';
import { subscribeCatalog } from '@/lib/apps/catalog';
import { seedSessionFromCache } from '@/lib/apps/ingest';
import { legacyAppAddress } from '@/lib/apps/legacy';
import type { AppManifest } from '@/lib/apps/manifest';
import { requestSessionLoad } from '@/lib/apps/resolve';
import { useMyPubkey } from '@/lib/nostr-bridge';
import { useAuthor } from '@/lib/social/useAuthor';
import { isStale, useAppsStore } from '@/store/apps';

/** Give the channel subscription a moment before asking the relay for this one session by id. */
export const RESOLVE_GRACE_MS = 400;

const LEGACY_TITLES: Record<string, string> = { 'chain-reaction': 'Chain Reaction', vesta: 'Vesta', stacker: 'Stacker' };

function Face({ pubkey }: { pubkey: string }) {
  const a = useAuthor(pubkey);
  return <UserAvatar pubkey={pubkey} picture={a.picture} size={5} name={a.displayName || a.name || ''} className="-ml-1 first:ml-0 ring-2 ring-lc-dark" />;
}

function AppCard({ sessionId }: { sessionId: string }) {
  const summary = useSessionSummary(sessionId);
  const me = useMyPubkey();
  const setOpen = useAppsStore((s) => s.setOpenSession);
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<AppManifest[]>([]);

  useLayoutEffect(() => {
    if (!summary) seedSessionFromCache(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (summary) return;
    const timer = setTimeout(() => requestSessionLoad(sessionId), RESOLVE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [sessionId, summary]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    void subscribeCatalog(setCatalog).then((fn) => { if (cancelled) fn(); else unsub = fn; });
    return () => { cancelled = true; unsub?.(); };
  }, []);

  if (!summary) {
    return (
      <span className="mt-1 block max-w-sm rounded-lg border border-lc-border bg-lc-dark p-3" data-testid="app-card-loading">
        <span className="lc-skeleton block h-4 w-32 rounded" />
      </span>
    );
  }

  const address = summary.pin?.address ?? (summary.legacyGame ? legacyAppAddress(summary.legacyGame) : null);
  const manifest = address ? catalog.find((m) => m.address === address) : undefined;
  const title = manifest?.title ?? (summary.legacyGame ? LEGACY_TITLES[summary.legacyGame] ?? summary.legacyGame : address?.split(':')[2] ?? 'App');
  const isGame = manifest ? manifest.types.includes('game') : true;
  const stale = isStale(summary);
  const closed = summary.cancelled || stale;
  const joined = !!me && summary.participants.includes(me);
  const line = summary.cancelled ? t('apps.cardClosed') : stale ? t('apps.cardStale')
    : summary.status ?? t('apps.cardIn').replace('{n}', String(summary.participants.length));

  return (
    <button
      type="button"
      onClick={() => setOpen(sessionId)}
      className="mt-1 flex w-full max-w-sm items-center gap-3 rounded-lg border border-lc-border bg-lc-dark p-3 text-left transition-colors hover:border-lc-green/60"
      data-testid="app-card"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lc-green/15 text-lc-green">
        {isGame ? <GamepadIcon size={18} /> : <AppsIcon size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-lc-white" data-testid="app-card-title">{title}</span>
        <span className="block truncate text-[11px] text-lc-muted" data-testid="app-card-status">{line}</span>
      </span>
      <span className="flex shrink-0 items-center">
        {summary.participants.slice(0, 4).map((pk) => <Face key={pk} pubkey={pk} />)}
      </span>
      <span className="shrink-0 rounded-full border border-lc-border px-2 py-0.5 text-[10px] text-lc-white">
        {closed ? t('apps.cardView') : joined ? t('apps.cardOpen') : t('apps.cardJoin')}
      </span>
    </button>
  );
}

export default memo(AppCard);
