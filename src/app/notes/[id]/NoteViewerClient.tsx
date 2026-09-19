'use client';

/**
 * Interactive half of the public note viewer.
 *
 * The server resolves the event so the HTML (and the link preview) is
 * complete without JS. This island re-renders it with the real components —
 * clickable mentions, media galleries, article typography — and falls back to
 * fetching client-side when the server's bounded query came up empty, which
 * happens when the relays were slow rather than when the note is gone.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Event as NostrEvent } from 'nostr-tools';
import { fetchNote } from '@nostr-wot/data';
import { initSocial, querySocial } from '@/lib/social/pool';
import { DEFAULT_SOCIAL_RELAYS } from '@/lib/social/relays';
import { KIND_NOTE, renderModeFor } from '@/lib/social/kinds';
import { getPreferences } from '@/lib/preferences';
import { useTranslation } from '@/i18n/context';
import NoteCard from '@/components/social/NoteCard';
import ArticleReader from '@/components/social/ArticleCard';
import type { ViewerTarget } from '@/lib/social/identifier';

export default function NoteViewerClient({
  target,
  initialNote,
}: {
  target: ViewerTarget | null;
  initialNote: NostrEvent | null;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState<NostrEvent | null>(initialNote);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(
    initialNote ? 'ready' : target ? 'loading' : 'missing',
  );

  useEffect(() => {
    // Server already found it, or there was nothing to look for.
    if (initialNote || !target) return;
    let cancelled = false;

    // A visitor may never have opened the app, so fall back to defaults.
    const configured = getPreferences().socialRelays;
    const relays = [...new Set([
      ...target.relays,
      ...(configured.length ? configured : DEFAULT_SOCIAL_RELAYS),
    ])];
    initSocial(relays);

    (async () => {
      if (target.kind === 'address') {
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

      if (target.kind === 'profile') {
        setState('missing');
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
  }, [target, initialNote]);

  const isArticle = useMemo(
    () => (note ? renderModeFor(note.kind) === 'article' : false),
    [note],
  );

  if (state === 'loading') {
    return (
      <div className="space-y-3 p-5" data-testid="note-viewer-loading">
        {[0, 1, 2].map((item) => <div key={item} className="lc-skeleton h-24 rounded-xl" />)}
      </div>
    );
  }

  if (state === 'missing' || !note) {
    return (
      <div className="px-5 py-20 text-center" data-testid="note-viewer-missing">
        <h1 className="text-lg font-semibold text-lc-white">{t('social.noteNotFoundTitle')}</h1>
        <p className="mt-2 text-sm text-lc-muted">{t('social.noteNotFound')}</p>
        <Link href="/app?s=feed" className="lc-pill-primary mt-6 inline-block px-5 py-2 text-xs">
          {t('noteViewer.openApp')}
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="note-viewer">
      {isArticle ? (
        <ArticleReader note={note} />
      ) : (
        <div className="border-b border-lc-border">
          <NoteCard note={note} />
        </div>
      )}
    </div>
  );
}
