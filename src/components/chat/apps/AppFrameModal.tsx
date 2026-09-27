'use client';

/**
 * An app, running. The chrome (title, "by <author> · third-party app",
 * fullscreen, close) is drawn HERE, outside the sandbox, where the app can't
 * reach it — that label is the main defence against an app drawing a fake
 * Obelisk screen (obelisk-apps docs/security.md).
 *
 * The frame:
 *   <iframe src=frame.obelisk.ar sandbox="allow-scripts" allow="" …>
 *   → loader posts `hello`; we check it came from THIS iframe's window
 *   → verify the pinned entry, open a MessageChannel, post `boot` + the port
 *   → from then on, AppHost talks over the port only.
 * A second `load` event means the app navigated its frame away (the one
 * exfiltration path the sandbox can't close): the frame is torn down.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import ModalShell from '@/components/ModalShell';
import { CloseIcon, MaximizeIcon, MinimizeIcon } from '@/components/ui/icons';
import { useTranslation } from '@/i18n/context';
import { catalogApp, subscribeCatalog } from '@/lib/apps/catalog';
import { loadPathBlob } from '@/lib/apps/bundle';
import { AppHost } from '@/lib/apps/host';
import { onIngest } from '@/lib/apps/ingest';
import { legacyAppAddress } from '@/lib/apps/legacy';
import type { AppManifest, AppPath } from '@/lib/apps/manifest';
import { resolvePeople, resolvePerson } from '@/lib/apps/people';
import { publishSessionEvent } from '@/lib/apps/transport';
import { sessionIdOf, type SessionPin, type SessionSummary } from '@/lib/apps/session';
import { requestSessionLoad } from '@/lib/apps/resolve';
import { seedSessionFromCache } from '@/lib/apps/ingest';
import { useSessionSummary } from '@/hooks/chat/useAppSessions';
import { useConnectionState, useGroups, useMyPubkey } from '@/lib/nostr-bridge';
import { useAuthor } from '@/lib/social/useAuthor';
import { shortNpubLabel } from '@/lib/short-npub';
import { useAppsStore } from '@/store/apps';
import { useToastStore } from '@/store/toast';

export const APP_FRAME_URL = process.env.NEXT_PUBLIC_APP_FRAME_URL ?? 'https://frame.obelisk.ar/v1/';

/** What the frame will run: the session's pin, or for a legacy table the official app's current files. */
function resolveRunnable(summary: SessionSummary, catalog: AppManifest[]): { pin: SessionPin; manifest: AppManifest | null } | { error: 'legacy' } {
  if (summary.pin) {
    return { pin: summary.pin, manifest: catalog.find((m) => m.address === summary.pin!.address) ?? catalogApp(summary.pin.address) };
  }
  const address = summary.legacyGame ? legacyAppAddress(summary.legacyGame) : null;
  const m = address ? catalog.find((x) => x.address === address) : null;
  if (!m) return { error: 'legacy' };
  return { pin: { address: m.address, aggregate: m.aggregate, paths: m.paths, api: m.api }, manifest: m };
}

function AuthorLabel({ pubkey }: { pubkey: string }) {
  const a = useAuthor(pubkey);
  return <>{a.displayName || a.name || a.nip05 || shortNpubLabel(pubkey)}</>;
}

type Phase = { kind: 'loading' } | { kind: 'running' } | { kind: 'error'; message: string };

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

export default function AppFrameModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const summary = useSessionSummary(sessionId);
  const me = useMyPubkey();
  const connection = useConnectionState();
  const groups = useGroups();
  const { locale, t } = useTranslation();
  const [catalog, setCatalog] = useState<AppManifest[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [fullscreen, setFullscreen] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hostRef = useRef<AppHost | null>(null);
  const connectedSince = useRef<number | null>(null);

  useEffect(() => {
    if (!summary) {
      seedSessionFromCache(sessionId);
      requestSessionLoad(sessionId);
    }
  }, [sessionId, summary]);

  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;
    void subscribeCatalog(setCatalog).then((fn) => { if (cancelled) fn(); else unsub = fn; });
    return () => { cancelled = true; unsub?.(); };
  }, []);

  const runnable = useMemo(() => (summary ? resolveRunnable(summary, catalog) : null), [summary, catalog]);
  const pin = runnable && 'pin' in runnable ? runnable.pin : null;
  const manifest = runnable && 'pin' in runnable ? runnable.manifest : null;
  const title = manifest?.title ?? pin?.address.split(':')[2] ?? 'App';
  const author = pin?.address.split(':')[1] ?? null;
  const channelName = groups.find((g) => g.id === summary?.channelId)?.name ?? '';

  // Boot once per pin: wait for the loader's hello from THIS iframe, then hand over the port.
  const bootKey = pin ? `${sessionId}:${pin.aggregate}` : null;
  useEffect(() => {
    if (!bootKey || !pin || !summary) return;
    if (pin.api !== 1) {
      setPhase({ kind: 'error', message: t('apps.errorNewerObelisk') });
      return;
    }
    let disposed = false;
    let booting = false;
    let loads = 0;
    const iframe = iframeRef.current;
    const servers = manifest?.servers ?? [];
    const entryPath = pin.paths.find((p) => p.path === '/index.js')!;
    const entryPromise = loadPathBlob(entryPath, servers);

    const onLoad = () => {
      loads += 1;
      if (loads > 1) {
        // The app navigated its own frame. Whatever it put in that URL is
        // gone; stop it before it can do it again.
        hostRef.current?.dispose();
        hostRef.current = null;
        if (iframe) iframe.src = 'about:blank';
        setPhase({ kind: 'error', message: fill(t('apps.errorNavigated'), { title }) });
      }
    };
    iframe?.addEventListener('load', onLoad);

    const onMessage = async (e: MessageEvent) => {
      if (disposed || hostRef.current || !iframe || e.source !== iframe.contentWindow) return;
      const msg = e.data as { obelisk?: unknown; type?: unknown };
      if (!msg || msg.obelisk !== 1 || msg.type !== 'hello' || booting) return;
      booting = true; // one boot per frame, however many hellos arrive
      let entry: Blob;
      try {
        entry = await entryPromise;
      } catch {
        setPhase({ kind: 'error', message: fill(t('apps.errorFetch'), { title }) });
        return;
      }
      if (disposed) return;
      const host = new AppHost({
        me,
        app: { address: pin.address, title, version: manifest?.version ?? undefined, author: author ?? '' },
        session: { id: summary.id, channelId: summary.channelId, createdBy: summary.createdBy, createdAt: summary.createdAt, channelName },
        paths: pin.paths,
        locale,
        theme: { mode: 'dark', accent: readAccent() },
        connection: { connected: connection === 'Connected', since: connectedSince.current },
        publish: (t) => publishSessionEvent(t),
        loadPath: (p: AppPath) => loadPathBlob(p, servers),
        profile: resolvePerson,
        storage: window.localStorage,
        toast: (text, tone) => useToastStore.getState().pushToast({ title: tone === 'error' ? t('apps.appError') : title, body: text }),
        close: onClose,
      });
      hostRef.current = host;
      const { port1, port2 } = new MessageChannel();
      host.attach(port1, await resolvePeople(summary.participants), summary.events);
      iframe.contentWindow?.postMessage({ obelisk: 1, type: 'boot', entry }, '*', [port2]);
      setPhase({ kind: 'running' });
    };
    window.addEventListener('message', onMessage);
    return () => {
      disposed = true;
      window.removeEventListener('message', onMessage);
      iframe?.removeEventListener('load', onLoad);
      hostRef.current?.dispose();
      hostRef.current = null;
    };
    // The boot is keyed on the pinned bundle; later summary changes flow as pushes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootKey]);

  // Live events for this session, straight from the ingest seam.
  useEffect(() => onIngest((batch) => {
    const mine = batch.filter((ev) => sessionIdOf(ev) === sessionId);
    if (mine.length) hostRef.current?.pushEvents(mine);
  }), [sessionId]);

  // Participants, connection, locale: pushed when they change.
  const participantsKey = summary?.participants.join(',') ?? '';
  useEffect(() => {
    if (!summary || !hostRef.current) return;
    void resolvePeople(summary.participants).then((p) => hostRef.current?.pushParticipants(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantsKey]);

  useEffect(() => {
    const connected = connection === 'Connected';
    if (connected && connectedSince.current === null) connectedSince.current = Math.floor(Date.now() / 1000);
    if (!connected) connectedSince.current = null;
    hostRef.current?.pushConnection({ connected, since: connectedSince.current });
  }, [connection]);

  useEffect(() => {
    hostRef.current?.pushEnv({ locale, theme: { mode: 'dark', accent: readAccent() } });
  }, [locale]);

  useEffect(() => {
    const onVis = () => hostRef.current?.pushVisibility(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const runError = runnable && 'error' in runnable ? t('apps.errorLegacy') : null;

  return (
    <ModalShell
      onClose={onClose}
      testId="app-frame-modal"
      panelClassName={
        fullscreen
          ? 'relative flex h-[100dvh] w-screen flex-col bg-lc-dark'
          : 'relative flex h-[min(92vh,760px)] w-full max-w-3xl mx-4 flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark'
      }
    >
      <div className="flex items-center gap-3 border-b border-lc-border px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-lc-white" data-testid="app-frame-title">{title}</h2>
          <p className="truncate text-[11px] text-lc-muted" data-testid="app-frame-author">
            {author ? <>{t('apps.by')} <AuthorLabel pubkey={author} /> · {t('apps.thirdPartyApp')}</> : t('apps.thirdPartyApp')}
          </p>
        </div>
        <button type="button" onClick={() => setFullscreen((v) => !v)}
          className="rounded-lg border border-lc-border bg-lc-card/60 p-1.5 text-lc-white hover:border-lc-muted"
          aria-label={fullscreen ? t('apps.exitFullscreen') : t('apps.fullscreen')} data-testid="app-frame-fullscreen">
          {fullscreen ? <MinimizeIcon size={16} /> : <MaximizeIcon size={16} />}
        </button>
        <button type="button" onClick={onClose}
          className="rounded-lg border border-lc-border bg-lc-card/60 p-1.5 text-lc-white hover:border-lc-muted"
          aria-label={t('common.close')} data-testid="app-frame-close">
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {pin && phase.kind !== 'error' && !runError && (
          <iframe
            ref={iframeRef}
            src={APP_FRAME_URL}
            title={title}
            sandbox="allow-scripts"
            allow=""
            referrerPolicy="no-referrer"
            className="h-full w-full border-0 bg-lc-dark"
            data-testid="app-frame"
          />
        )}
        {(phase.kind === 'loading' && !runError) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3" data-testid="app-frame-loading">
            <div className="lc-skeleton h-40 w-64 rounded-lg" />
            <p className="text-xs text-lc-muted">{fill(t('apps.loading'), { title })}</p>
          </div>
        )}
        {(phase.kind === 'error' || runError) && (
          <div className="flex h-full items-center justify-center p-6 text-center" data-testid="app-frame-error">
            <p className="max-w-sm text-sm text-lc-white">{runError ?? (phase.kind === 'error' ? phase.message : '')}</p>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/** The accent the relay's branding set (purple on public.obelisk.ar), as #rrggbb. */
function readAccent(): string {
  if (typeof document === 'undefined') return '#b4f953';
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-lc-green').trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : '#b4f953';
}

/** Mounts the frame for whatever session the store says is open. */
export function AppFrameHost() {
  const openSessionId = useAppsStore((s) => s.openSessionId);
  const setOpenSession = useAppsStore((s) => s.setOpenSession);
  if (!openSessionId) return null;
  return <AppFrameModal key={openSessionId} sessionId={openSessionId} onClose={() => setOpenSession(null)} />;
}
