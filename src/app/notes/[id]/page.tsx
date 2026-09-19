'use client';

/**
 * Public note viewer — `/notes/<nevent|naddr|note|hex>`.
 *
 * Share links used to point at njump.me, which meant every shared Obelisk
 * link handed the reader to a third party and the preview card in whatever
 * chat it was pasted into was njump's. This is the same idea, ours: resolve
 * the identifier against the social relays, render the note (or the article,
 * properly typeset), and offer an obvious way into the app.
 *
 * Deliberately client-rendered like the rest of this app — there is no
 * server, so resolution happens in the browser against the reader's own
 * relay set (or the defaults when they've never configured any).
 */

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { nip19 } from 'nostr-tools';
import type { Event as NostrEvent } from 'nostr-tools';
import { fetchNote } from '@nostr-wot/data';
import { querySocial, initSocial } from '@/lib/social/pool';
import { DEFAULT_SOCIAL_RELAYS } from '@/lib/social/relays';
import { KIND_NOTE, renderModeFor } from '@/lib/social/kinds';
import { getPreferences } from '@/lib/preferences';
import { useTranslation } from '@/i18n/context';
import NoteCard from '@/components/social/NoteCard';
import ArticleReader from '@/components/social/ArticleCard';
import ObeliskIcon from '@/components/ObeliskIcon';

type Target =
  | { kind: 'event'; id: string; relays: string[] }
  | { kind: 'address'; identifier: string; pubkey: string; eventKind: number; relays: string[] }
  | null;

/** Accept every shareable spelling, plus a bare hex id. */
function parseTarget(raw: string): Target {
  const value = decodeURIComponent(raw).replace(/^nostr:/, '');
  if (/^[0-9a-f]{64}$/i.test(value)) return { kind: 'event', id: value.toLowerCase(), relays: [] };
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'note') return { kind: 'event', id: decoded.data, relays: [] };
    if (decoded.type === 'nevent') {
      return { kind: 'event', id: decoded.data.id, relays: decoded.data.relays ?? [] };
    }
    if (decoded.type === 'naddr') {
      return {
        kind: 'address',
        identifier: decoded.data.identifier,
        pubkey: decoded.data.pubkey,
        eventKind: decoded.data.kind,
        relays: decoded.data.relays ?? [],
      };
    }
  } catch {
    return null;
  }
  return null;
}

export default function NoteViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useTranslation();
  const target = useMemo(() => parseTarget(id), [id]);
  const [note, setNote] = useState<NostrEvent | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!target) {
      setState('missing');
      return;
    }
    let cancelled = false;

    // A visitor may have never opened the app, so fall back to the defaults
    // rather than reading an empty preference.
    const configured = getPreferences().socialRelays;
    const relays = [...new Set([
      ...target.relays,
      ...(configured.length ? configured : DEFAULT_SOCIAL_RELAYS),
    ])];
    initSocial(relays);

    (async () => {
      if (target.kind === 'address') {
        // Addressable: latest revision wins, so ask for the coordinate.
        const events = await querySocial([{
          kinds: [target.eventKind],
          authors: [target.pubkey],
          '#d': [target.identifier],
          limit: 1,
        }], { relays });
        if (cancelled) return;
        const newest = events.sort((a, b) => b.created_at - a.created_at)[0] ?? null;
        setNote(newest);
        setState(newest ? 'ready' : 'missing');
        return;
      }

      const entry = await fetchNote(target.id, relays);
      if (cancelled) return;
      if (!entry) {
        setState('missing');
        return;
      }
      setNote({
        id: entry.id,
        pubkey: entry.pubkey,
        content: entry.content,
        created_at: entry.createdAt,
        tags: entry.tags,
        kind: KIND_NOTE,
        sig: '',
      });
      setState('ready');
    })().catch(() => {
      if (!cancelled) setState('missing');
    });

    return () => { cancelled = true; };
  }, [target]);

  const isArticle = note ? renderModeFor(note.kind) === 'article' : false;

  return (
    <main className="min-h-screen bg-lc-black text-lc-white">
      <header className="sticky top-0 z-10 border-b border-lc-border bg-lc-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-3">
          <Link href="/" className="flex items-center gap-2" aria-label="Obelisk">
            <ObeliskIcon className="h-6 w-6" />
            <span className="text-sm font-semibold">Obelisk</span>
          </Link>
          <Link href="/app" className="lc-pill-primary ml-auto px-4 py-2 text-xs">
            {t('noteViewer.openApp')}
          </Link>
        </div>
      </header>

      {state === 'loading' && (
        <div className="mx-auto max-w-2xl space-y-3 p-5" data-testid="note-viewer-loading">
          {[0, 1, 2].map((item) => <div key={item} className="lc-skeleton h-24 rounded-xl" />)}
        </div>
      )}

      {state === 'missing' && (
        <div className="mx-auto max-w-2xl px-5 py-20 text-center" data-testid="note-viewer-missing">
          <h1 className="text-lg font-semibold">{t('social.noteNotFoundTitle')}</h1>
          <p className="mt-2 text-sm text-lc-muted">{t('social.noteNotFound')}</p>
        </div>
      )}

      {state === 'ready' && note && (
        <div className="mx-auto max-w-2xl" data-testid="note-viewer">
          {isArticle ? (
            <ArticleReader note={note} />
          ) : (
            <div className="border-b border-lc-border">
              <NoteCard note={note} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
